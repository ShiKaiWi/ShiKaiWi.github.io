import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowFriends } from "../src/lib/friends.js";

test("shouldShowFriends hides empty or missing lists", () => {
  assert.equal(shouldShowFriends(undefined), false);
  assert.equal(shouldShowFriends(null), false);
  assert.equal(shouldShowFriends([]), false);
  assert.equal(shouldShowFriends([{ name: "tao", url: "http://tao93.top" }]), true);
});
