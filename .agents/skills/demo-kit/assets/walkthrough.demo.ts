import {
  demo,
  expect,
  openSeededEditor,
  test,
} from "../../.agents/skills/demo-kit/scripts/demo";

/**
 * A starter walkthrough. Replace the steps with the feature's own.
 *
 * Each beat is one thing a Coach does and the result he sees. The caption is
 * filmed under the video, so keep it under 64 characters. The detail is one
 * more sentence for the kit page.
 */
test("walkthrough", async ({ page }, testInfo) => {
  const d = await demo(page, testInfo);
  await openSeededEditor(page);

  await d.beat(
    "Run the play",
    async () => {
      const bar = page.getByLabel("Playback controls");
      await d.click(bar.getByRole("button", { name: "Play", exact: true }));
      await expect(
        bar.getByRole("button", { name: "Pause", exact: true }),
      ).toBeVisible();
      await d.pause(1500);
    },
    { detail: "Every man runs his route from the snap." },
  );
});
