#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "::error::The PROJECT_PAT repository secret is missing."
  exit 1
fi

PROJECT_DATA="$(
  gh api graphql \
    -f query='
      query($owner: String!, $number: Int!, $issue: ID!) {
        repositoryOwner(login: $owner) {
          ... on ProjectV2Owner {
            projectV2(number: $number) {
              ...ProjectDetails
            }
          }
        }
        node(id: $issue) {
          ... on Issue {
            projectItems(first: 100) {
              nodes {
                id
                project {
                  id
                }
              }
            }
          }
        }
      }

      fragment ProjectDetails on ProjectV2 {
        id
        title
        fields(first: 100) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    ' \
    -f owner="$PROJECT_OWNER" \
    -F number="$PROJECT_NUMBER" \
    -f issue="$ISSUE_NODE_ID"
)"

PROJECT_JSON="$(
  jq -c '
    .data.repositoryOwner.projectV2
    // empty
  ' <<< "$PROJECT_DATA"
)"

if [[ -z "$PROJECT_JSON" ]]; then
  echo "::error::Could not find project #$PROJECT_NUMBER for owner '$PROJECT_OWNER', or PROJECT_PAT cannot access it."
  exit 1
fi

PROJECT_ID="$(jq -r '.id' <<< "$PROJECT_JSON")"
PROJECT_TITLE="$(jq -r '.title' <<< "$PROJECT_JSON")"

STATUS_FIELD_JSON="$(
  jq -c --arg field "$STATUS_FIELD_NAME" '
    [.fields.nodes[] | select(.name == $field)][0] // empty
  ' <<< "$PROJECT_JSON"
)"

if [[ -z "$STATUS_FIELD_JSON" ]]; then
  echo "::error::Project '$PROJECT_TITLE' has no single-select field named '$STATUS_FIELD_NAME'."
  exit 1
fi

STATUS_FIELD_ID="$(jq -r '.id' <<< "$STATUS_FIELD_JSON")"
STATUS_OPTION_JSON="$(
  jq -c --arg status "$TARGET_STATUS" '
    [
      .options[]
      | select(
          (.name | ascii_downcase | gsub("\\s"; ""))
            == ($status | ascii_downcase | gsub("\\s"; ""))
        )
    ][0] // empty
  ' <<< "$STATUS_FIELD_JSON"
)"

if [[ -z "$STATUS_OPTION_JSON" ]]; then
  echo "::error::Field '$STATUS_FIELD_NAME' has no option named '$TARGET_STATUS' (case-insensitive)."
  exit 1
fi

STATUS_OPTION_ID="$(jq -r '.id' <<< "$STATUS_OPTION_JSON")"
STATUS_OPTION_NAME="$(jq -r '.name' <<< "$STATUS_OPTION_JSON")"

ITEM_ID="$(
  jq -r --arg project "$PROJECT_ID" '
    [
      .data.node.projectItems.nodes[]
      | select(.project.id == $project)
      | .id
    ][0] // empty
  ' <<< "$PROJECT_DATA"
)"

if [[ -z "$ITEM_ID" ]]; then
  echo "Issue is not in '$PROJECT_TITLE'; adding it now."

  ITEM_ID="$(
    gh api graphql \
      -f query='
        mutation($project: ID!, $issue: ID!) {
          addProjectV2ItemById(
            input: {
              projectId: $project
              contentId: $issue
            }
          ) {
            item {
              id
            }
          }
        }
      ' \
      -f project="$PROJECT_ID" \
      -f issue="$ISSUE_NODE_ID" \
      --jq '.data.addProjectV2ItemById.item.id'
  )"
fi

if [[ -z "$ITEM_ID" ]]; then
  echo "::error::Could not find or create the Project item."
  exit 1
fi

gh api graphql \
  -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $project
          itemId: $item
          fieldId: $field
          value: {
            singleSelectOptionId: $option
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  ' \
  -f project="$PROJECT_ID" \
  -f item="$ITEM_ID" \
  -f field="$STATUS_FIELD_ID" \
  -f option="$STATUS_OPTION_ID" \
  --silent

echo "Moved issue $ISSUE_NUMBER to '$STATUS_OPTION_NAME' in '$PROJECT_TITLE'."
