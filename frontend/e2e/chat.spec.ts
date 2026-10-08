import { expect, test, type Page } from "@playwright/test";

const API = "http://api.test";

const SSE_BODY =
  ": connected\n\n" +
  'event: sources\ndata: {"sources":[{"source":"Medical_book.pdf","page":42,"snippet":"Diabetes mellitus is a metabolic disease."}]}\n\n' +
  'event: token\ndata: {"text":"Diabetes is a condition "}\n\n' +
  'event: token\ndata: {"text":"that affects blood sugar."}\n\n' +
  'event: done\ndata: {"conversation_id":"c_test","latency_ms":42}\n\n';

async function mockApi(page: Page) {
  await page.route(`${API}/api/v1/chat/stream`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "POST, OPTIONS",
        },
      });
    }
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
      body: SSE_BODY,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});

test("empty state shows suggestions and the disclaimer", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Medical Chatbot" })).toBeVisible();
  await expect(page.getByRole("note", { name: "Medical disclaimer" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Suggested questions" }).getByRole("button")).toHaveCount(4);
});

test("asking a question streams an answer with sources, and the chat is saved in the sidebar", async ({ page, isMobile }) => {
  await page.getByRole("textbox", { name: "Message" }).fill("What is diabetes?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Diabetes is a condition that affects blood sugar.")).toBeVisible();
  await expect(page.getByText("Sources (1)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Conversations" }).getByText("What is diabetes?")).toBeVisible();
});

test("clicking a suggested prompt sends it", async ({ page }) => {
  await page.getByRole("list", { name: "Suggested questions" }).getByRole("button").first().click();
  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await expect(page.getByText("that affects blood sugar.")).toBeVisible();
});

test("theme toggle switches data-theme and persists across reloads", async ({ page }) => {
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  const after = await html.getAttribute("data-theme");
  expect(after).not.toBe(before);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after ?? "");
});

test("new chat shortcut (Ctrl+K) returns to the empty state", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message" }).fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible();
});

test("shows a friendly error with Retry when the API fails", async ({ page }) => {
  await page.unroute(`${API}/api/v1/chat/stream`);
  await page.route(`${API}/api/v1/chat/stream`, (route) =>
    route.fulfill({
      status: 503,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { code: "unavailable", message: "The knowledge base is still loading." } }),
    }),
  );
  await page.getByRole("textbox", { name: "Message" }).fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("still loading");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
