# Hello embed

Hello can be embedded in any webpage using iFrame as shown below. [Demo link](https://hello-demo-embed.surge.sh/)

```
<iframe src="https://hello.vasanthv.me/your-channel-here?nameJohn&theme=F22952" allow="camera; microphone" seamless width="480" height="640" frameBorder="0"></iframe>
```

Hello supports the following URL params.

| Param  | Description                            | Type    | Example  | Default |
| ------ | -------------------------------------- | ------- | -------- | ------- |
| name   | Adds a default name for the user.      | string  | `John`   | `null`  |
| theme  | Hex code of a color without the #.     | string  | `F22952` | `null`  |
| chat   | A boolean to disable the chat feature. | boolean | `false`  | `true`  |
| header | A boolean to hide the header.          | boolean | `false`  | `true`  |
