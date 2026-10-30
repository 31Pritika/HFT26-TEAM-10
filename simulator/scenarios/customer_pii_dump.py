"""A customer export pasted into a chatbot: real local Ollama if it is running, otherwise the mock provider."""
from __future__ import annotations

from .. import fakes
from ..client import OLLAMA_URL, Context, process_info
from .base import Scenario, openai_body

CUSTOMERS = 20


def run(ctx: Context) -> None:
    csv = fakes.customers_csv(fakes.fake_customers(CUSTOMERS * ctx.intensity))
    prompt = f"Clean up this customer CSV and remove duplicates:\n\n{csv}"
    process = process_info("python3 crm_export_helper.py")
    model = ctx.ollama_model()
    if model:
        body = {"model": model, "stream": False, "messages": [{"role": "user", "content": prompt}]}
        ctx.exchange("/api/chat", body, host="localhost", process=process, base_url=OLLAMA_URL, tags=["ollama"])
    else:
        ctx.exchange("/v1/chat/completions", openai_body(prompt), host="api.openai.com", process=process)


SCENARIO = Scenario("customer_pii_dump", "Customer CSV to chatbot",
                    "20 fake Indian customers with Aadhaar, PAN, phone, UPI and email reach a chatbot.", "users",
                    "high", ("pii", "dpdp"), run)
