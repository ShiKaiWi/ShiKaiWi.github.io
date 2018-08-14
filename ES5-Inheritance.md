# ES5 实现继承
### `__proto__` 和 `prototype` 的区别
在阐述原型之前，必须先澄清这两个概念的区别，其实说穿了也很简单，一个 object 的原型实际上就是 `__proto__`，那么 `prototype` 又是什么呢？
直接看如下一个例子：
```javascript
function Constructor() {
    this.x = 3;
}
Constructor.prototype. y = 4;
var obj = new Constructor();
console.log(obj.__proto__ === Constructor.prototype) //true
console.log(obj.x, obj.y) //3, 4
```

看到这里你就知道了，当使用 `new Cnostructor()` 来创建对象的话，那么 `Constructor` 的 `prototype` 便会是新创建对象的 `__proto__`。
值得注意的是，上面这个例子中，x 和 y 的查询是不同的，x 属于 obj 自己的属性，而 y 是属于其原型的属性。

因此，`prototype` 是 `function` 才有的属性，而所谓的原型编程实际上就是指使用 `function` 来进行 `__proto__` 的创建与传递。

另外，这里给出 `Object` 和 `Function` 的 `__proto__` 和 `prototype`:（注意 `Object` 和 `Function` 的类型都是 `Function`）

```nodejs
> Function.__proto__
[Function]
> Function.__proto__.__proto__
{}
> Function.__proto__.__proto__.__proto__
null
> Object.__proto__
[Function]
> Object.__proto__.__proto__
{}
> Object.__proto__.__proto__.__proto__
null
> Function.prototype
[Function]
> Object.prototype
{}
```

根据图中可以发现，`Function.__proto__` 是 `Function`，也就是说是 `Function` 的 `prototype`，也就是说 `Function` 是由 `Function` 构造出来的（确实 `Function` 也是一个 `Function`）。

另外 `Function.prototype.__proto__` 和 `Object.prototype` 相等，这是因为 `Function` 是继承自 `Object` 的（具体的继承看下一节，实际上就是做了 `Function.prootype = new Object()`）。
而 `Object.__proto__` 又是 `Function.prototype`，这个是因为 `Object` 本身是一个函数，必定是由 `Function` 构造出来的。

原型链的终点就是 null 了，也就是 `Object.__proto__.__proto__.__proto__` `Object.prototype.__proto__`
`Function.prototype.__proto__.__proto__` 都是 null。

### 使用 prototype 来进行面向对象编程
在 ES6 之前，并没有 class 的对象，但即使到了 ES6，所谓的 class 不过是 syntax sugar，本质其实还是 prototype 编程。

下面是一个最简单版本的继承：
```javascript
function SupCls() {
    this.x = 1;
}
SupCls.prototype.y = 2;
var supCls = new SupCls();
console.log(supCls.x, supCls.y);
// output: 1, 2

// now we will make an inheritance
function SubCls() {
    this.z = 3;
}
SubCls.prototype = new SupCls();
SubCls.prototype.constructor = SubCls;
var subCls = new SubCls();
console.log(subCls.x, subCls.y, subCls.z);
// output: 1, 2, 3
console.log(subCls.__proto__);
// output: SupCls { x: 1, constructor: [Function: SubCls] }
console.log(subCls.hasOwnProperty('x'));
// output: false
```

这里解释一下最关键的一步，`SubCls.prototype =  new SupCls()`，这可以使得新创建的 `subCls.__proto__ === SupCls.prototype`，从而使得其具有父类的属性。

这里有读者可能会产生这样的疑惑为什么不将 `SupCls.prototype` 直接赋值给 `SubCls.prototype`，而是用 `SupCls` 的一个实例来赋值？
这其实试一下就会发现原因：`SupCls` 的属性来自两个地方，一个是实例属性，另一个是原型属性，如果采用直接赋值原型，则会导致无法产生实例属性来提供给 `SubCls` 继承。

除此之外还有一个令人迷惑的地方就是，为什么需要做 `SubCls.prototype.constructor = SubCls`？其实这步对于结果来说无关紧要，只是将 SubCls 的原型中的 constructor 指向正确的地方，如果没有这一步，上面的结果依然如此，也就是说 new 不会根据 prototype 的 constructor 来改变其行为，constructor 的存在只是给生成的 object 添加一个正确的引用。

其实这里有一个陷阱，那就是最后一条语句表明，`x` 不是 `subCls` 的 `instance` 属性！
为什么会这样？其实很好理解，因为 `x` 根据我们的做法是属于 `SubCls.prototype` 的属性，自然也是属于 `subCls.__proto__` 而不是 `subCls` 的属性。

那么如何解决这个问题呢？
说出来其实很简单，无非就是把 `SupCls` 中的 `this` 换成我们想要的，也就是对 `SubCls` 中的 `this`，做一次 `binding` 就行了。

看下面的实现方式:
```javascript
function SupCls() {
    this.x = 1;
}
SupCls.prototype.y = 2;
var supCls = new SupCls();
console.log(supCls.x, supCls.y);
// output: 1, 2

// now we will make an inheritance
function SubCls() {
    this.z = 3;
    // binding is done here
    SubCls.supertype.constructor.apply(this);
}
SubCls.prototype = new SupCls();
SubCls.prototype.constructor = SubCls;
SubCls.supertype = SupCls.prototype;
var subCls = new SubCls();
console.log(subCls.x, subCls.y, subCls.z);
// output: 1, 2, 3
console.log(subCls.__proto__);
// output: SupCls { x: 1, constructor: [Function: SubCls] }
console.log(subCls.hasOwnProperty('x'));
// output: true
```

也许你以为到这里就解决问题了，但实际上还有一个问题！
你可以发现，`SupCls` 被调用了两次，而这个是可以避免的，为什么这么说？我们看这两次的调用时机：
1. `SubCls.prototype = new SupCls();`
2. `SubCls.supertype.constructor.apply(this);`

可以发现第一次的调用其实没有必要，因为第一次的调用我们只是想要拿到 SupCls 的 prototype 信息，而不是以它为 constructor 创建的 instance 信息，所以为了避免这个，我们可以这样来结束讨论：
```javascript
function SupCls() {
    this.x = 1;
}
SupCls.prototype.y = 2;
var supCls = new SupCls();
console.log(supCls.x, supCls.y);
// output: 1, 2

// now we will make an inheritance
function SubCls() {
    this.z = 3;
    // binding is done here
    SubCls.supertype.constructor.apply(this);
}

// new part start
function middleConstructor() {}
middleConstructor.prototype = SupCls.prototype;
SubCls.prototype = new middleConstructor();
// new part end

SubCls.prototype.constructor = SubCls;
SubCls.supertype = SupCls.prototype;
var subCls = new SubCls();
console.log(subCls.x, subCls.y, subCls.z);
// output: 1, 2, 3
console.log(subCls.__proto__);
// output: SubCls { x: 1, constructor: [Function: SubCls] }
console.log(subCls.hasOwnProperty('x'));
// output: true
```

最关键的是，我们构造了一个空函数，并且让其 `prototype` 来等于 `SupCls.prototype`，然后再用该构造函数来进行 `SubCls.prototype` 的赋值：
```javascript
function middleConstructor() {}
middleConstructor.prototype = SupCls.prototype;
SubCls.prototype = new middleConstructor();
```

这样就避免了 `SubCls` 的一次无效调用。
