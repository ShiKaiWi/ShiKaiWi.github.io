# Golang-JSONEncoding

## Problem
工作中遇到这样的问题：
用 golang 需要存储一段 json 数据到数据库，为此先将这段数据 base64 了一下然后再存储到数据库，之后取出之后直接返回给了前端，前端先用 `atob` 做 base64 解码，之后调用 `JSON.parse` 尝试将数据恢复成 json，对于 ASCII 字符来说这样并不会有什么问题，然而对于含有 unicode 字符的时候就出现了乱码。

此外，我同样用 python 将一段 json 数据变成 string，然后再使用 base64 encoding 存入数据，然而发现前端取这段数据又是正常的（即使其中含有中文）。

## 原因
因为自己的精力有限，我直接写出最终得到的结论：
首先乱码的问题其实是 atob 这个 function 引起的，其实 base64 解码本身和 encoding 无关，然而 atob 这个 function 不仅做了 base64 decode 的工作，与此同时它还将 decode 结果转换成一个 javascript 的 string，然而你会发现这个字符串解析的过程其实是不识别 unicode 的，因此直接出现了乱码。

那为什么 python 的 base64 encoding 就没有问题呢？
其实按照上面所述，出现乱码和 base64 根本毫无关系，golang 和 python 产生区别原因只是在于对于 unicode 的 string 编码，golang 的 JSON.Marshal 默认用 UTF-8 编码存储，下面看一个例子。

如果 JSON 数据如下：
```javascript
{name: "魏"}
```

经过 golang 处理会得到如下的 UTF-8 编码（ASCII 码用字符表示，其他用数据表示）：
```javascript
'{' 'n' 'a' 'm' 'e' ':' '"' '\xe9' '\xad' '\x8f' '"' '}'
```

这个是合法的 JSON 格式，但是这个对于 atob 也无法解析，因为 atob 不认识 UTF-8，而 python 却不是这样的，python 编码后的结果是：
```javascript
'{' 'n' 'a' 'm' 'e' ':' '"' '\' 'u' '9' 'B' '4' 'F' '"' '}'
```

这里注意 9B4F 是 '魏' 的 code point 参考这个 [魏 code point](http://unicode.scarfboy.com/?s=%E9%AD%8F)，如果想知道为什么用 4 个十六进制的数据就可以表达一个 unicode，可以参考这个 [code point](https://en.wikipedia.org/wiki/Unicode#Code_point_planes_and_blocks)

注意除了使用 UTF-8，直接使用 unicode point 也是 JSON 的合法表达，可以参考这个 [json 规范](http://json.org/)， 并且因为也是因为这样编码不会存在任何非 ASCII 码，从而导致 atob 之后仍然可以被 JSON.parse 解析成正确的 javascript  string 对象。

## Solution
解决方案有两种：
1. 前端实现支持 UTF-8 编码的 base64 decoder（注意这里的 不仅要做 base64 decoding 也要做 string decoding）
2. 后端采用 code point 方式进行 JSON Marshal（下面不采用这种方法）

封装支持 UTF-8 的 base64 decoder，可以在 `atob` 的基础上做一下 UTF-8 的支持：
```javascript
function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}
```

> 该 function 可以从这个 [Base64EncodingDecoding](https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding) 找到

对上述代码有几点值得解释一下：
1. 首先还是使用 `atob(str)` 来做 base64 decoding，并且转换成 UTF-16（占用 2 个 bytes）的 js string
2. 对于每个 js string 字符 c, 我们使用 `c.charCodeAt(0).toString(16)`，将每个字符转化成十六进制的数字字符串
3. 然后考虑到部分字符只会占用一个字节（比如 ascii ），通过添加 `'00'` 以及 `slice(-2)` 来将原始的 unicode code point 还原出来
4. 得到了原始的 unicode code point 数组，我们利用 `%` + `decodeURIComponent`来做字符串的 decoding，从而得到最终合法的 js 字符串
