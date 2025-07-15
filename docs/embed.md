# Ahey embed

Ahey can be embedded in any webpage using iFrame as shown below. [Demo link](https://ahey-demo-embed.surge.sh/)

```
<iframe
  src="https://ahey.ney/your-room-here?name=John"
  width="100%"
  height="600"
  style="border:0;"
  allow="camera; microphone; fullscreen; display-capture"
  frameBorder="0"
></iframe>
```

Ahey supports the following URL params.

| Param | Description                            | Type    | Example | Default |
| ----- | -------------------------------------- | ------- | ------- | ------- |
| name  | Adds a default name for the user.      | string  | `John`  | `null`  |
| chat  | A boolean to disable the chat feature. | boolean | `false` | `true`  |
