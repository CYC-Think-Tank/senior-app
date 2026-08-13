import assert from "node:assert/strict";
import test from "node:test";

const { detectBackdrop } = await import(
  "../src/lib/realtime/icebreaker-backdrop.ts"
);

test("plain English answers pick their backdrop", () => {
  assert.deepEqual(detectBackdrop("Coffee, please."), {
    key: "coffee",
    group: "beverage",
  });
  assert.deepEqual(detectBackdrop("Oh, tea. Always tea."), {
    key: "tea",
    group: "beverage",
  });
  assert.deepEqual(detectBackdrop("I'd say autumn."), {
    key: "autumn",
    group: "season",
  });
  assert.equal(detectBackdrop("Winter, when it snows.").key, "winter");
  assert.equal(detectBackdrop("Spring I think.").key, "spring");
  assert.equal(detectBackdrop("Summer, by the sea.").key, "summer");
});

test("American 'fall' still means autumn", () => {
  assert.equal(detectBackdrop("The fall, definitely.").key, "autumn");
});

test("the last option named wins, so a correction is honoured", () => {
  assert.equal(detectBackdrop("Not tea — coffee, please.").key, "coffee");
  assert.equal(detectBackdrop("Coffee? No, no. Tea.").key, "tea");
});

test("Chinese answers match without word boundaries", () => {
  assert.deepEqual(detectBackdrop("我喜欢春天"), {
    key: "spring",
    group: "season",
  });
  assert.equal(detectBackdrop("夏天最好").key, "summer");
  assert.equal(detectBackdrop("秋天吧").key, "autumn");
  assert.equal(detectBackdrop("冬天").key, "winter");
  assert.equal(detectBackdrop("我要咖啡").key, "coffee");
  assert.equal(detectBackdrop("茶，谢谢").key, "tea");
});

test("milk tea is tea, and coffee is not mistaken for it", () => {
  assert.equal(detectBackdrop("奶茶").key, "tea");
  assert.equal(detectBackdrop("咖啡").key, "coffee");
});

test("an answer naming none of them raises nothing", () => {
  assert.equal(detectBackdrop("I don't really mind either way."), null);
  assert.equal(detectBackdrop("我不太在意"), null);
});

test("substrings do not trigger an English match", () => {
  assert.equal(detectBackdrop("We used to teach at the school."), null);
  assert.equal(detectBackdrop("The springboard was rusty."), null);
});

test("repeated calls are stable despite the global patterns", () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(detectBackdrop("Tea, please.").key, "tea");
  }
});
