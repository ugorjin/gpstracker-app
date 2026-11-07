# WeChat mini program

These pages explain how to open the vendor's own WeChat mini program
(appId `wx1adc416eb7f77a05`). They only matter for users in China / on WeChat,
and are listed here for completeness.

## From a web page (inside WeChat)

Uses the WeChat open tag `<wx-open-launch-weapp>`
(<https://developers.weixin.qq.com/doc/service/guide/h5/opentag.html>).
Works only on pages opened inside WeChat.

| Parameter | Description | Notes |
|---|---|---|
| `appId` | Target mini program appId | `'wx1adc416eb7f77a05'` |
| `path` | Target page path | `'pages/login/login?username=justdemo&password=Aa1357'` |
| | | Passing `username` and `password` logs in automatically; values must be `encodeURIComponent`-encoded |

```html
<wx-open-launch-weapp
  id="launch-btn"
  appid="wx1adc416eb7f77a05"
  path="pages/login/login?username=justdemo&password=Aa1357"
>
  <script type="text/wxtag-template">
    <style>.btn { padding: 12px }</style>
    <button class="btn">Open mini program</button>
  </script>
</wx-open-launch-weapp>
<script>
  var btn = document.getElementById('launch-btn');
  btn.addEventListener('launch', function (e) { console.log('success'); });
  btn.addEventListener('error', function (e) { console.log('fail', e.detail); });
</script>
```

## From another mini program

Uses `wx.navigateToMiniProgram`
(<https://developers.weixin.qq.com/miniprogram/dev/api/navigate/wx.navigateToMiniProgram.html>).
Same `appId` and `path` parameters as above.

```js
wx.navigateToMiniProgram({
  appId: 'wx1adc416eb7f77a05',
  path: 'pages/login/login',
  extraData: { foo: 'bar' },
  envVersion: 'develop',
  success(res) { /* opened */ },
});
```
