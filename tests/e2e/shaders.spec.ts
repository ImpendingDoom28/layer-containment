import { onOpenGame } from "./fixtures/navigation";
import { expect, test } from "./test";

const THREE_SHADER_FAILURE =
  /Shader Error|Fragment shader is not compiled|VALIDATE_STATUS false/i;

test("does not log WebGL shader compile failures when entering gameplay", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const badMessages: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (THREE_SHADER_FAILURE.test(text)) {
      badMessages.push(text);
    }
  });

  page.on("pageerror", (err) => {
    if (THREE_SHADER_FAILURE.test(err.message)) {
      badMessages.push(err.message);
    }
  });

  await onOpenGame(page, { waitForTowerShop: true });

  expect(
    badMessages,
    `Unexpected shader-related console errors: ${badMessages.join("\n---\n")}`
  ).toEqual([]);
});
