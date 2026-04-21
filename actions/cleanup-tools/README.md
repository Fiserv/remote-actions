# Cleanup Tools

This action removes the `.dev-studio-tools` directory from the workspace if it exists.

## Behavior

- Removes `${{ github.workspace }}/.dev-studio-tools` when present.
- Does nothing when the directory is missing.
- Does not fail when there is nothing to delete.

## Example

```yaml
- name: Cleanup tools directory
  if: always()
  uses: Fiserv/remote-actions/actions/cleanup-tools@main
```
