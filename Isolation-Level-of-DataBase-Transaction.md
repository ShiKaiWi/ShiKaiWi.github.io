# Isolation Level of DataBase Transaction
## 概要
Transaction 作为数据的一个重要特性给使用者提供了 ACID 四种保证，本文将会对 I（Isolation）的不同 Level 进行一些入门式的讨论，对于每一个 Level 的 Isolation 主要讨论其概念，解决的问题以及解决的方法。

## Weak Isolation Levels
其实为了达到 Isolation 的效果，最简单的方法就是单线程去处理所有的请求，也就是 Serializability，但是这样的话 performance 将会大幅度下降，所以几乎都不会这样处理，因为我们需要的是达到一定程度上 Serializable 的效果，而不是真的 Serializability。

一般情况下越接近 Serializable，算法的设计会越来越复杂，性能也会越来越差，所以一般数据库都提供了不同 level 的 isolation，而 Weak Isolation Levels 就是一些没有达到 Serializability，但是却解决了一定程度上的并发问题的 isolation 模型。

本文不涉及如何达到 Serializable 的相关内容 ，但会依次介绍不同的 isolation level。

### Read Committed
#### 是什么意思？
这个 level 简单说就是：**只能看到 committed 的内容**
具体来说其实分为两种情况：
1. 读的时候，只能读到 committed 的内容
2. 写的时候，只能 overwrite committed 的内容

#### 解决了什么？
这个 level 主要处理了 dirty reads 和 dirty writes 两种情况，下面举例说明。

dirty reads:
```
T1									|T2
Begin      						|
Set X=3(initial value is 2)		|Begin
Setting X							|Get X
Finish Setting X					|Getting X
Set Y=3							|Finish Getting X=3
Fail to Set Y                    |
Rollback						    |(now X should be 2)
```

本文采用了一些简写以方便举例以及排版，大概规则如下：
1. T+数字 是指 Transaction + 编号
2. 一次操作包括开始，运行中，结束，比如 Set 操作：`Set`, `Setting`, `Finish Setting`，描述上允许用最后一步表示已经完成
3. Begin Commit Rollback 的语义和 Transaction 相同

现在看第一个例子，其中的代码还是很容易理解的，T1 更新 X 的操作被 T2 中途感知，但是 T2 却又无法看到到 T1 因为无法设置 Y，直接 Rollback 了，X 的值实际上还是 initail value，而不是 3。

dirty writes，顾名思义其实就是指两个 transaction 在 commit 之前就互相 overwrite 掉对方的值。
最常见的情况就是对于多处内容的更改，可能会导致内容不 consistent，可以看下面一个例子，该例子使用了两个表，商品（goods）和账单（Invoices），两者的每行记录都会记录下商品 id 和 购买者：

```
T1									|T2
Begin								|-
Set[Goods]id=1,buyer=Alice		|Begin
Setting                          |Set[Goods]id=1,buyer=Bob
Finish Setting					|Setting
Set[Invoices]gID=1,buyer=Alice	|Finish Setting[Goods]
Setting							|Set[Invoices]gID=1,buyer=Bob
Finish Setting & Commit			|Setting
```

在最后一刻我们可以发现 Goods 表里面的内容和 Invoices 表里面的内容不一致了：Goods 表里面 id=1 的商品的购买者是 Bob，但是 Invoices 表里面记录的 id=1 的购买者却是 Alice。

#### 如何解决的？
Read committed 的实现一般是通过 row-level lock 来实现的，也就是说在一个 Transaction 中，如果需要修改某一行，就需要取得这一行的 lock，如果已经被别人取得了，那么就 block 或者 abort。
此外对于 Transaction 中的 Read 的话，为了保证不被 block 住（因为对于数据库来说读操作可能非常多），一般取得 lock 的 transaction 会记录下 initial value，然后依据这个 initial value 来响应来自其他 transaction 的 Read 操作。

### Snapshot Isolation
#### 是什么意思？
Snapshot isolation 又叫做 Repeatable Read， 意思是在一次 Transaction 中对于同一个值的多次读取都是一致的。 
#### 解决了什么？
如其概念所述，Read Committed 保证了不会看到没有 committed 的内容，但是即使保证了这一点仍然会出现 non-repeatable read 的问题，比如 T2 在 T1 没有结束之前读了一个值，T1 对这个值做出了修改，并且 commit 了，那么 T2 再读一遍这个值，就会发现和第一次读的值不一致，也就是所谓的 non-repeatable read 或者说 `Read skew`。

`Read Skew` 的例子:
```
T1									|T2
Begin								|Begin
Set X=3(initial value is 2)		|Finish Getting X=2
Finish Setting & Commit			|Finish Getting X=3
```

#### 如何解决的？
解决方法其实是 Read Committed 的拓展，在 Read Committed 中针对读的优化是通过记录下相应 row 的 initial value 来保证其他 transaction 读的正确性，其实就是记录了两个版本的 row，放到 Snapchat 这里的话，仅仅只有两个 version 的值是不够的，因为需要考虑到每个 transaction 对要读和要修改的 row 的影响，顺理成章地也就形成了 MVCC（multi-version concurrent control）这一 Solution。

关于 MVCC，会在之后的文章中做专门而详细的描述。

### Isolation level preventing concurrency writing
#### 是什么意思？
Read Committed 和 Snapshot Isolation 两个 level 其实只是解决了 Read & Write 的 Concurrency 的问题，对于 Write & Write 的 Concurrency 的问题其实并没有解决。

看以下的一个例子：
```
T1									|T2
Begin								|Begin
Finish Getting B=200				|Finish Getting B=200
Finish Setting B=B+100			|Finish Setting B=B+100
Commit							|Commit
```

其中 B 是 Balance 的缩写，T1 和 T2 并发完成，可以看成转账操作，结果表明 T1 和 T2 完成之后，本来应该转入了一共 200，但是实际上只有 100，这种现象一般叫做 **Lost Update**。

除了 **Lost Update**，其实还有另外一种更普遍的情况（可以将 **Lost Update** 看成这种普遍情况的一种特例）：
```
T1									|T2
Begin								|Begin
Finish Getting B=200				|Finish Getting B=200
if B>=100: Set B=B-100			|if B>=100: Set B=B-100
Finish Setting B=100				|Finish Setting B=100
Commit							|Commit
```

也许读者会觉得这里的这种情况和上一个例子没什么区别，但是笔者认为这里实际上是一个更普遍的例子：**Lost Update** 的根本原因是 Write 依赖于写之前的 Read，然而被依赖的 Read 可能会发生变化，从而导致依赖这个过时的 Read 值（称为 Phantom）的 Write 实际上是一次错误的 Write，也就是 **Write Skew**。

#### 如何解决？
目前针对 **Write Skew** 的解决方法一般是分为两个方向：
1. 提供 GetForUpdate 操作对 Read Dependency 上锁
2. 在 Commit 的时候，检测是否出现 **Write Skew**

另外针对 **Lost Update**，大部分 database 都会提供 Atomic Write 的操作，比如 mysql 中：
```sql
Update Balance SET B=B+100 WHERE id=xxx;
```

## Reference
1. Designing Data-Intensive Applications by Martin Kleppmann

