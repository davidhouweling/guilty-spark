#!/bin/bash
branches=(
  "chore/remove-old-tracker"
  "feat/auth-infrastructure"
  "feat/backend-durable-objects"
  "feat/halo-proxy-refactor"
  "feat/frontend-tracker-shell"
  "feat/routing-public-overlay"
  "feat/neatqueue-integration"
  "feat/tracker-polish-docs"
)

echo "branch|typecheck|lint|format|test"
echo "---|---|---|---|---"

for br in "${branches[@]}"; do
  git checkout "$br" > /dev/null 2>&1
  
  results=()
  errors=""

  for cmd in "npm run typecheck" "npm run lint" "npm run format" "npm test"; do
    output=$($cmd 2>&1)
    if [ $? -eq 0 ]; then
      results+=("PASS")
    else
      results+=("FAIL")
      errors+="\n[$br - $cmd]:\n$(echo "$output" | grep -v "npm ERR!" | head -n 10)\n"
    fi
  done

  echo "$br|${results[0]}|${results[1]}|${results[2]}|${results[3]}"
  echo -e "$errors" >> fail_details.log
done
