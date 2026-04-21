# Run Node Script

This action performs the common tasks of:

- Ensuring the `node_modules` for the [`scripts` folder](../../scripts/) are restored and cached.
- Executing a Node script.

A future improvement to this:

- Convert all of the custom scripts into [JavaScript actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action) so this restore process is not required.
- Use exit codes to determine success/failure instead of searching the output.

## Inputs

- `script-command` (required): Script or script with arguments passed to `npm run`.
- `display-name` (optional): Friendly text shown in the action step as `Running <display-name>`.

## Outputs

- `status`: One of `FAILED`, `PASSED`, `SKIPPED`, or `UNKNOWN`.
- `result`: Raw output captured from the `npm run` command.

## Example

```yaml
- name: Run Markdown validator
  id: markdown_validate
  uses: Fiserv/remote-actions/actions/run-node-script@main
  with:
    display-name: Markdown validator
    script-command: markdown ${{ github.workspace }}
```
