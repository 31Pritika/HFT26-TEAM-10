# Shadow Sensor

Chrome and Edge extension (Manifest V3), owned by Part B, see spec 02 §B7. It watches paste and prompt submit on AI chat
sites, scans the text in the page, and offers to redact it before anything reaches the site.

Sites: chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, chat.deepseek.com,
chat.mistral.ai, huggingface.co/chat.

## Install

| Browser | Steps |
|---|---|
| Chrome | Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose this `extension/` folder |
| Edge | Open `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, choose this `extension/` folder |

Start the engine on port 8787 to see events in the dashboard. Without it the extension still scans and warns, and it queues
events until the engine returns.

## How it behaves

- **Paste with sensitive data:** the paste is held back and a toast lists what was found, masked. **Redact & paste** inserts the
  masked text, **Paste anyway** inserts the original, Esc inserts nothing.
- **Send with sensitive data:** the same check on Enter or the send button, with **Redact & paste** replacing the box and
  **Send anyway** sending as it is. A value already allowed at paste time is not asked about again.
- **The popup** has the on/off toggle, today's counts per site, engine status and **Open dashboard**.

## Privacy

- Scanning happens in the page. Raw text is not sent anywhere, including to the local engine.
- The worker talks only to `http://localhost:8787` and redacts the text a second time before sending.
- A clean paste or prompt is recorded as metadata only, with empty `text`: the site and time, not what was typed.
- Permissions are `storage` plus the sites above and localhost. There is no remote code.

## Testing

`test.html` needs no install: open the file in a browser and try the samples. Every value is fake.

```bash
python -m pytest extension                  # scanner.js against the Python scanner, every fixture
ENGINE=none node extension/tests/e2e_chrome.mjs   # the real extension in real Chrome
```

The Chrome test loads this extension into a throwaway profile, on a page that believes it is chatgpt.com. The resolver maps that
name to a local server and blocks every other host, so nothing can reach a provider. Leave out `ENGINE=none` to test against a
running engine.

### Testing on real sites

Do this in Chrome and Edge, on chatgpt.com and claude.ai, signed in.

**Golden rule 5: never send fake secrets to a real AI provider.** Paste only. Do not submit a message containing them.

1. Open `test.html`, and copy the AWS key sample.
2. Paste into the site's prompt box. The toast should appear, and the box should stay empty.
3. Click **Redact & paste**, and check the box shows the masked value.
4. Clear the box without sending. Do not click **Send anyway**.
5. Check the popup's counts, and the dashboard if the engine is running.

## Limits

- Text is checked on paste and on submit, not as it is typed.
- Only text is scanned. Dropped files and images are not.
- Send buttons are found by common attributes, and a site can change them. Enter and paste do not depend on that.
- The toast is not shown inside iframes, because content scripts run in the top frame only.
