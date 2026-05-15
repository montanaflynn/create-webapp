---
name: dev-server
description: Start the Next.js dev server in the background and watch it for errors, warnings, and route activity. Use when the user says "start the dev server", "run dev", "start the app", "start and monitor", or anything equivalent for this project.
user-invocable: false
allowed-tools: Bash(npm run dev), Bash(until *), Bash(grep *), Bash(tail *), Monitor, Read
---

# dev-server

Start `next dev` in the background, wait until it's ready, then arm a Monitor that streams errors and route activity to the chat.

## Steps

1. **Check first.** If a `npm run dev` background task is already running for this project, don't start a second one — just (re-)arm the monitor against its output file. Two dev servers fight for port 3000.

2. **Launch.** Run `npm run dev` via Bash with `run_in_background: true`. Capture the output file path the runtime returns.

3. **Wait for ready.** Block until the log shows `Ready in` (or an early `Error`):

   ```bash
   until grep -qE "Ready in|Error|EADDRINUSE" <output-file>; do sleep 1; done
   ```

   If `EADDRINUSE` shows up, port 3000 is taken — surface it to the user and stop, don't loop.

4. **Read the head of the log** (`head -50`) so the user sees the URL and any startup warnings.

5. **Arm the monitor** with `Monitor`, `persistent: true`, tailing the output file with a filter that catches both happy and failure signals:

   ```bash
   tail -F -n 0 <output-file> 2>/dev/null \
     | grep -E --line-buffered "error|Error|ERROR|warn|Warn|WARN|fail|Fail|FAIL|unhandled|Unhandled|⨯|✗|GET |POST |PUT |DELETE |PATCH |compiled|Compiled|hydration|Hydration"
   ```

   Description: `errors and route activity from dev server`.

6. **Tell the user** the URL (`http://localhost:3000`) and that the monitor is armed. Don't poll the log yourself afterwards — events arrive as notifications.

## Notes

- The `-F` (capital) form of `tail` follows the file by name, so it survives Next.js's log rotation/truncation on rebuild.
- `--line-buffered` on `grep` is required — without it, pipe buffering delays events by minutes.
- Don't narrow the filter to just errors. A silent monitor during a crashloop is indistinguishable from a healthy idle server; route hits and "Compiled" lines are the heartbeat.
- If the user later asks to stop monitoring, use `TaskStop` on the monitor task. The dev server keeps running until they exit the session or kill it explicitly.
