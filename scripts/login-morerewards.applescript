-- AppleScript to open Chrome, fill login fields, click submit, and report outcome
set theURL to "https://account.morerewards.ca/login"
set baseDir to do shell script "pwd"
set fillPath to baseDir & "/scripts/morerewards-fill.js"
set checkPath to baseDir & "/scripts/morerewards-check.js"
set errPath to baseDir & "/scripts/morerewards-error.js"

-- Read JS payloads
set fillJS to read POSIX file fillPath
set checkJS to read POSIX file checkPath
set errJS to read POSIX file errPath

-- Build credential replacements via env (USERNAME/PASSWORD already set in parent shell)
set userB64 to do shell script "printf %s \"$USERNAME\" | /usr/bin/base64"
set passB64 to do shell script "printf %s \"$PASSWORD\" | /usr/bin/base64"

-- Replace placeholders in fillJS
set AppleScript's text item delimiters to "USER_B64"
set tmpItems to text items of fillJS
set AppleScript's text item delimiters to userB64
set fillJS to tmpItems as text
set AppleScript's text item delimiters to "PASS_B64"
set tmpItems2 to text items of fillJS
set AppleScript's text item delimiters to passB64
set fillJS to tmpItems2 as text
set AppleScript's text item delimiters to ""

tell application "Google Chrome"
  activate
  if (count of windows) = 0 then make new window
  set theTab to active tab of front window
  set theTab's URL to theURL
  delay 0.5
  -- Wait for email field
  set maxTries to 160
  repeat with i from 1 to maxTries
    set rs to execute javascript "document.readyState" in theTab
    set hasEmail to execute javascript "!!(document.querySelector('#email')||document.querySelector('input[type=email]')||document.querySelector('input[name=email]')||document.querySelector('input[id*=email i]'))" in theTab
    if (rs is "complete" and hasEmail is "true") then exit repeat
    delay 0.25
  end repeat

  -- Execute the fill + click script
  execute javascript fillJS in theTab

  -- Poll for success or inline error (30-40s)
  set status to "unknown"
  set message to ""
  repeat with i from 1 to 160
    set notLogin to execute javascript "!/\\/login(\\b|\\/|\\?|#)/i.test(location.pathname)" in theTab
    if (notLogin is "true") then
      set status to "success"
      exit repeat
    end if
    set err to execute javascript errJS in theTab
    if (err is not "") then
      set status to "error"
      set message to err
      exit repeat
    end if
    delay 0.25
  end repeat

  if status is "success" then
    return "{\"status\":\"success\"}"
  else if status is "error" then
    return "{\"status\":\"error\",\"message\":\"" & message & "\"}"
  else
    return "{\"status\":\"unknown\"}"
  end if
end tell
