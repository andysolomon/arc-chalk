import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChalkApp } from "./chalk-app";

describe("Chalk application shell", () => {
  it("preserves the original editor entry points", () => {
    render(<ChalkApp />);

    expect(
      screen.getByRole("navigation", { name: "Workspace views" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Play inspector" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Stick — Thunder football play" }),
    ).toBeVisible();
  });

  it("keeps the play name editable and exposes the original modes", async () => {
    const user = userEvent.setup();
    render(<ChalkApp />);

    const name = screen.getByRole("textbox", { name: "Play name" });
    await user.clear(name);
    await user.type(name, "Mesh — Alert");
    await user.click(screen.getByRole("button", { name: "Present" }));

    expect(screen.getByText("Present mode")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Play name" })).toHaveValue(
      "Mesh — Alert",
    );
  });
});
