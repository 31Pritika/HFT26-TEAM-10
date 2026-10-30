"""Every scenario through a recording transport. The safety tests here are golden rule 5: no fake secret leaves localhost."""
import contextlib
import io
import json
import pathlib

import httpx
import pytest

from shadowscope_detect import analyze_agent_payload, scan_text
from simulator import client as client_module
from simulator import fakes, mock_provider, run
from simulator.client import SWEEP_HOSTS, Context, UnsafeTarget
from simulator.demo_sequence import ORDER
from simulator.scenarios import BY_ID, SCENARIOS, gateway_block

ALL_IDS = [scenario.id for scenario in SCENARIOS]
CONTRACT = json.loads((pathlib.Path(__file__).parents[2] / "contracts" / "mock" / "scenarios.json").read_text())["items"]
POLICY = {"canary_tokens": ["CANARY-POLICY-1234"], "block_on_critical": True}


class Network:
    """Stands in for everything off this process and records every request."""

    def __init__(self, policy=POLICY, gateway_status=403):
        self.requests = []
        self.policy = policy
        self.gateway_status = gateway_status

    def __call__(self, request):
        self.requests.append(request)
        host, path = request.url.host, request.url.path
        if path == "/api/policies":
            return httpx.Response(200, json=self.policy) if self.policy is not None else httpx.Response(500)
        if path == "/api/observations":
            return httpx.Response(200, json={"accepted": 1, "event_ids": ["evt_1"]})
        if request.url.port == 8789:
            return httpx.Response(self.gateway_status, json={"error": "blocked by ShadowScope"})
        if request.url.port == 8788:
            return httpx.Response(200, json=mock_provider.reply_for(path, json.loads(request.content)))
        return httpx.Response(404)

    def observations(self):
        return [json.loads(r.content) for r in self.requests if r.url.path == "/api/observations"]

    def to(self, port):
        return [r for r in self.requests if r.url.port == port]


def play(scenario_id, net=None, intensity=1):
    net = net or Network()
    ctx = Context(scenario_id, intensity=intensity, transport=httpx.MockTransport(net), run_id="run_test")
    with contextlib.redirect_stdout(io.StringIO()):
        BY_ID[scenario_id].run(ctx)
    ctx.close()
    return net


def dry_observations(scenario_id, intensity=1):
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        assert run.main([scenario_id, "--dry-run", "--intensity", str(intensity)]) == 0
    return [json.loads(line) for line in buffer.getvalue().splitlines() if line.startswith("{")]


def findings_in(observations):
    found = set()
    for observation in observations:
        found |= {f["subtype"] for f in scan_text(observation.get("body_text") or "")["findings"]}
        for key, direction in (("body_text", "request"), ("response_text", "response")):
            if observation.get(key):
                try:
                    payload = json.loads(observation[key])
                except ValueError:
                    payload = observation[key]
                found |= {f["subtype"] for f in analyze_agent_payload(payload, direction=direction)["findings"]}
    return found


# --- golden rule 5 ------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_no_request_with_a_body_leaves_this_machine(scenario_id):
    for request in play(scenario_id).requests:
        if request.content or request.method != "GET":
            assert request.url.host in client_module.LOOPBACK_HOSTS, str(request.url)


@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_only_the_sweep_contacts_a_remote_host(scenario_id):
    remote = {r.url.host for r in play(scenario_id).requests} - client_module.LOOPBACK_HOSTS
    assert remote == (set(SWEEP_HOSTS) if scenario_id == "shadow_saas_sweep" else set())


def test_sweep_sends_no_key_and_no_body():
    remote = [r for r in play("shadow_saas_sweep").requests if r.url.host in SWEEP_HOSTS]
    assert len(remote) == 5
    for request in remote:
        assert request.method == "GET" and not request.content and request.url.path == "/v1/models"
        assert "authorization" not in request.headers and "x-api-key" not in request.headers


def test_sweep_observations_have_no_body():
    observations = play("shadow_saas_sweep").observations()
    assert len(observations) == 5
    assert all(o.get("body_text") is None and o["dest"]["protocol"] == "tls" for o in observations)


@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_self_header_is_never_sent(scenario_id):
    assert not [r for r in play(scenario_id).requests if "x-shadowscope-self" in r.headers]


@pytest.mark.parametrize("scenario_id", [s for s in ALL_IDS if s != "shadow_saas_sweep"])
def test_provider_traffic_carries_the_sim_marker(scenario_id):
    traffic = [r for r in play(scenario_id).requests if r.url.port in (8788, 8789)]
    assert traffic and all(r.headers["x-shadowscope-sim"] == "1" for r in traffic)


def test_send_refuses_non_loopback_targets():
    with pytest.raises(UnsafeTarget):
        Context("x", transport=httpx.MockTransport(Network())).send("https://api.openai.com/v1/chat/completions", {"a": 1})


def test_send_refuses_a_lookalike_host():
    with pytest.raises(UnsafeTarget):
        Context("x", transport=httpx.MockTransport(Network())).send("http://localhost.evil.example/x", {"a": 1})


def test_send_refuses_the_self_header():
    with pytest.raises(UnsafeTarget):
        Context("x", transport=httpx.MockTransport(Network())).send("http://localhost:8789/x", {}, {"X-ShadowScope-Self": "1"})


def test_probe_refuses_other_hosts():
    with pytest.raises(UnsafeTarget):
        Context("x", transport=httpx.MockTransport(Network())).probe("example.com")


def test_proxies_are_ignored(monkeypatch):
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.example:3128")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example:3128")
    assert Context("x").client.trust_env is False


def test_redirects_are_not_followed():
    assert Context("x").client.follow_redirects is False


# --- gateway_block preflight --------------------------------------------------------------------------------------

def test_gateway_block_sends_when_every_check_passes():
    net = play("gateway_block")
    assert len(net.to(8789)) == 1
    assert net.observations() == []  # the gateway records a block itself


def test_gateway_payload_has_no_credentials_header():
    request = play("gateway_block").to(8789)[0]
    assert "authorization" not in request.headers and "x-api-key" not in request.headers


@pytest.mark.parametrize("policy", [None, {"block_on_critical": False}, {"block_on_critical": None}, {"block_on_critical": 0}])
def test_gateway_block_sends_nothing_unless_blocking_is_certain(policy):
    net = play("gateway_block", Network(policy=policy))
    assert net.to(8789) == []
    assert net.observations()[0]["meta"]["tags"] == ["gateway-skipped"]


def test_gateway_block_treats_a_missing_setting_as_the_gateway_does():
    assert len(play("gateway_block", Network(policy={"canary_tokens": []})).to(8789)) == 1


def test_gateway_block_sends_nothing_if_the_payload_is_not_critical(monkeypatch):
    monkeypatch.setattr(gateway_block, "scan_text", lambda text: {"findings": [{"severity": "high"}]})
    assert play("gateway_block").to(8789) == []


def test_every_secret_in_the_gateway_payload_rates_critical():
    assert all(f["severity"] == "critical" for f in scan_text(fakes.env_file())["findings"])


def test_gateway_not_blocking_is_reported_loudly(capsys):
    net = Network(gateway_status=200)
    ctx = Context("gateway_block", transport=httpx.MockTransport(net))
    BY_ID["gateway_block"].run(ctx)
    assert "FORWARDED" in capsys.readouterr().out
    assert net.observations()[0]["meta"]["tags"] == ["gateway-not-blocked"]


def test_gateway_down_still_reports():
    def refuse(request):
        if request.url.port == 8789:
            raise httpx.ConnectError("refused")
        return Network()(request)
    ctx = Context("gateway_block", transport=httpx.MockTransport(refuse))
    with contextlib.redirect_stdout(io.StringIO()) as out:
        BY_ID["gateway_block"].run(ctx)
    assert "not running" in out.getvalue()


# --- what each scenario produces ----------------------------------------------------------------------------------

@pytest.mark.parametrize("scenario_id,expected", [
    ("env_file_leak", {"aws_access_key", "aws_secret_key", "openai_key", "stripe_key", "db_connection_url"}),
    ("customer_pii_dump", {"bulk_pii", "aadhaar", "pan", "phone_in", "upi_id", "email"}),
    ("proprietary_code", {"proprietary_code", "jwt"}),
    ("rogue_agent", {"sensitive_file_read", "remote_code_exec", "recon", "unverified_tool_call", "internal_host",
                     "autonomous_loop", "persistence", "data_exfil_command", "private_key"}),
    ("local_llm_chat", {"email", "internal_host"}),
])
def test_scenario_triggers_its_findings(scenario_id, expected):
    assert expected <= findings_in(play(scenario_id).observations())


def test_env_leak_has_four_critical_findings():
    body = play("env_file_leak").observations()[0]["body_text"]
    assert sum(f["severity"] == "critical" for f in scan_text(body)["findings"]) >= 4


def test_rogue_agent_runs_eight_steps_with_growing_history():
    observations = play("rogue_agent").observations()
    assert len(observations) == 9  # eight tool calls, then the closing reply
    lengths = [len(json.loads(o["body_text"])["messages"]) for o in observations]
    assert lengths == sorted(lengths) and lengths[0] == 2


def test_rogue_agent_declares_a_langchain_framework_and_process():
    observation = play("rogue_agent").observations()[0]
    assert analyze_agent_payload(json.loads(observation["body_text"]), direction="request")["framework"] == "langchain"
    assert "langchain" in observation["process"]["cmdline_hint"]
    assert isinstance(observation["process"]["pid"], int)


def test_rogue_agent_never_executes_a_tool(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("a tool call was executed")
    monkeypatch.setattr("subprocess.run", forbidden)
    monkeypatch.setattr("os.system", forbidden)
    play("rogue_agent")


def test_canary_uses_the_policy_token():
    assert "CANARY-POLICY-1234" in play("canary_trip").observations()[0]["body_text"]


def test_canary_falls_back_when_the_backend_is_down():
    assert fakes.DEFAULT_CANARY in play("canary_trip", Network(policy=None)).observations()[0]["body_text"]


def test_exfil_sends_forty_full_payloads_but_reports_a_short_body():
    net = play("exfil_spike")
    assert len(net.to(8788)) == 40
    assert all(len(r.content) >= 200 * 1024 for r in net.to(8788))
    for observation in net.observations():
        assert observation["bytes_out"] >= 200 * 1024
        assert len(observation["body_text"]) < 500


@pytest.mark.parametrize("scenario_id,count", [("exfil_spike", 120), ("env_file_leak", 3), ("canary_trip", 3)])
def test_intensity_scales_the_work(scenario_id, count):
    assert len(play(scenario_id, intensity=3).observations()) == count


def test_intensity_scales_customers():
    body = play("customer_pii_dump", intensity=2).observations()[0]["body_text"]
    assert json.loads(body)["messages"][0]["content"].count("@example.com") == 40


def test_observations_carry_scenario_and_run_ids():
    meta = play("env_file_leak").observations()[0]["meta"]
    assert meta["scenario_id"] == "env_file_leak" and meta["run_id"] == "run_test"


@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_observations_match_the_contract(scenario_id):
    allowed = {"source", "ts", "process", "dest", "method", "headers", "body_text", "response_text", "bytes_out", "bytes_in", "meta"}
    for observation in play(scenario_id).observations():
        assert set(observation) <= allowed
        assert observation["source"] == "simulator"
        assert {"host", "port"} <= set(observation["dest"])


def test_dest_keeps_the_presented_host_and_the_real_port():
    dest = play("env_file_leak").observations()[0]["dest"]
    assert (dest["host"], dest["port"], dest["ip"]) == ("api.openai.com", 8788, "127.0.0.1")


# --- backend down, dry run, CLI -----------------------------------------------------------------------------------

@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_a_dead_backend_never_crashes_a_scenario(scenario_id):
    def handler(request):
        if request.url.port in (8787, None) or request.url.path.startswith("/api/"):
            raise httpx.ConnectError("refused")
        return Network()(request)
    ctx = Context(scenario_id, transport=httpx.MockTransport(handler))
    with contextlib.redirect_stdout(io.StringIO()) as out:
        BY_ID[scenario_id].run(ctx)
    assert '"source": "simulator"' in out.getvalue()


@pytest.mark.parametrize("scenario_id", ALL_IDS)
def test_dry_run_opens_no_socket_and_spawns_nothing(scenario_id, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("dry run touched the network or spawned a process")
    monkeypatch.setattr("socket.socket.connect", forbidden)
    monkeypatch.setattr("socket.socket.connect_ex", forbidden)
    monkeypatch.setattr("httpx.Client.send", forbidden)
    monkeypatch.setattr("subprocess.Popen", forbidden)
    assert dry_observations(scenario_id)


def test_dry_run_rogue_agent_still_walks_the_plan():
    assert len(dry_observations("rogue_agent")) == 9


def test_list_json_is_exactly_the_contract_registry(capsys):
    assert run.main(["--list", "--json"]) == 0
    assert json.loads(capsys.readouterr().out) == CONTRACT


def test_list_text(capsys):
    assert run.main(["--list"]) == 0
    assert "rogue_agent" in capsys.readouterr().out


@pytest.mark.parametrize("argv", [["nope"], []])
def test_unknown_or_missing_scenario_exits_2(argv, capsys):
    assert run.main(argv) == 2


def test_bad_intensity_is_rejected(capsys):
    with pytest.raises(SystemExit) as error:
        run.main(["env_file_leak", "--intensity", "4"])
    assert error.value.code == 2


def test_run_id_flag_reaches_the_observation(capsys):
    assert run.main(["env_file_leak", "--dry-run", "--run-id", "run_abc"]) == 0
    assert json.loads(capsys.readouterr().out.splitlines()[0])["meta"]["run_id"] == "run_abc"


def test_a_failing_scenario_returns_1_instead_of_raising(monkeypatch, capsys):
    from simulator.scenarios.base import Scenario
    def boom(ctx):
        raise ValueError("boom")
    monkeypatch.setitem(BY_ID, "env_file_leak", Scenario("env_file_leak", "", "", "", "", (), boom))
    assert run.main(["env_file_leak", "--dry-run"]) == 1


def test_demo_sequence_covers_every_scenario_in_spec_order():
    assert sorted(ORDER) == sorted(ALL_IDS)
    assert ORDER[:8] == ("shadow_saas_sweep", "env_file_leak", "customer_pii_dump", "proprietary_code", "rogue_agent",
                         "canary_trip", "gateway_block", "exfil_spike")
