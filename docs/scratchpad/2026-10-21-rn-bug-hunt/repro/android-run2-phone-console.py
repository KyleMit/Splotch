import datetime
import json
import re
import socket
from pathlib import Path

CONSOLE_PORT = 5680
SOCKET_TIMEOUT_SECONDS = 3
MAX_REPLY_BYTES = 8192
OUT = Path("docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-run2-phone-console.json")
result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "device": "emulator-5680",
    "consolePort": CONSOLE_PORT,
    "readOnly": True,
}
token = ""


def reply(connection):
    data = b""
    while len(data) < MAX_REPLY_BYTES:
        block = connection.recv(2048)
        if not block:
            break
        data += block
        lines = data.splitlines()
        if lines and (lines[-1] == b"OK" or lines[-1].startswith(b"KO:") or data.rstrip().endswith(b"(qemu)")):
            break
    return data.decode("utf-8", errors="replace")


try:
    with socket.create_connection(("127.0.0.1", CONSOLE_PORT), SOCKET_TIMEOUT_SECONDS) as connection:
        connection.settimeout(SOCKET_TIMEOUT_SECONDS)
        banner = reply(connection)
        if "Android Console" not in banner:
            raise RuntimeError("The named emulator port did not identify an Android console")
        result["identifiedConsole"] = True
        if "Authentication required" in banner:
            token = (Path.home() / ".emulator_console_auth_token").read_text().strip()
            if not re.fullmatch(r"[A-Za-z0-9+/=_-]{1,512}", token):
                raise RuntimeError("Unexpected console credential format")
            connection.sendall(("auth " + token + "\n").encode())
            authenticated = reply(connection)
            if "KO:" in authenticated or "OK" not in authenticated:
                raise RuntimeError("Console authentication did not succeed")
            result["authenticated"] = True
        for command in ["avd heartbeat", 'screenrecord screenshot /Users/kylemit/Code/Splotch/.claude/worktrees/codex-bughunt/docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-run2-phone-console-capture']:
            connection.sendall((command + "\n").encode())
            text = reply(connection)
            result[command] = text.replace(token, "<redacted>") if token else text
except Exception as error:
    message = str(error)
    result["error"] = message.replace(token, "<redacted>") if token else message

if OUT.exists():
    with OUT.with_name("android-run2-phone-console-history.jsonl").open("a") as history:
        history.write(json.dumps(json.loads(OUT.read_text())) + "\n")
OUT.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
