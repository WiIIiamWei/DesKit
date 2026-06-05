import type { RenderablePluginView } from "@/components/plugins/view-types"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ViewRenderer } from "@/components/plugins/view-renderer"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
  }),
}))

describe("viewRenderer", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders list items and sends the selected item with row actions", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "list",
      items: [
        {
          id: "copy-hello",
          title: "Copy hello",
          subtitle: "Copies a test value",
          actions: [{ type: "copy", value: "hello" }],
        },
      ],
    }

    render(<ViewRenderer view={view} onAction={onAction} />)
    await user.click(screen.getByRole("button", { name: /copy hello/i }))

    expect(screen.getByText("Copies a test value")).toBeInTheDocument()
    expect(onAction).toHaveBeenCalledWith(view.items?.[0].actions?.[0], {
      item: view.items?.[0],
    })
  })

  it("uses action placement to keep status actions pinned after inline actions", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "list",
      items: [
        {
          id: "first",
          title: "First item",
          actions: [
            {
              type: "custom",
              id: "copy-item",
              label: "Copy",
              icon: "lucide:copy",
              placement: "inline",
            },
            {
              type: "custom",
              id: "toggle-favorite",
              label: "Star",
              icon: "lucide:star",
              active: true,
              placement: "status",
            },
          ],
        },
        {
          id: "second",
          title: "Second item",
          actions: [{ type: "custom", id: "copy-item", label: "Copy", icon: "lucide:copy" }],
        },
      ],
    }

    const { container } = render(<ViewRenderer view={view} onAction={onAction} />)
    const firstRow = screen.getByRole("button", { name: /first item/i })

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Star" })).toHaveLength(1)
    expect(
      Array.from(firstRow.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label")
      )
    ).toEqual(["Copy", "Star"])
    expect(container.querySelector(".fill-current")).toBeInTheDocument()
    await user.hover(screen.getByRole("button", { name: /second item/i }))
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Star" })).toHaveLength(1)
  })

  it("keeps legacy active icon actions as pinned status actions", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "list",
      items: [
        {
          id: "legacy",
          title: "Legacy item",
          actions: [
            { type: "custom", id: "copy-item", label: "Copy", icon: "lucide:copy" },
            {
              type: "custom",
              id: "toggle-favorite",
              label: "Star",
              icon: "lucide:star",
              active: true,
            },
          ],
        },
      ],
    }

    render(<ViewRenderer view={view} onAction={onAction} />)
    await user.hover(screen.getByRole("button", { name: /legacy item/i }))

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Star" })).toHaveLength(1)
  })

  it("renders list accessory icons without text glyph markers", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "list",
      items: [
        {
          id: "favorite",
          title: "Favorite item",
          accessory: "just now",
          accessoryIcon: "lucide:star",
          accessoryIconActive: true,
          actions: [{ type: "custom", id: "copy-item", label: "Copy" }],
        },
        {
          id: "selected-filter",
          title: "Text only",
          accessoryIcon: "lucide:check",
          accessoryIconActive: true,
          actions: [{ type: "custom", id: "set-filter", label: "Select" }],
        },
      ],
    }

    const { container } = render(<ViewRenderer view={view} onAction={onAction} />)

    expect(screen.getByText("just now")).toBeInTheDocument()
    expect(screen.queryByText("★")).not.toBeInTheDocument()
    expect(screen.queryByText("✓")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".fill-current")).toHaveLength(1)
    await user.hover(screen.getByRole("button", { name: /text only/i }))
    expect(screen.queryByRole("button", { name: "Select" })).not.toBeInTheDocument()
    expect(container.querySelectorAll(".fill-current")).toHaveLength(1)
  })

  it("does not render host-owned selected row status icons", () => {
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "list",
      items: [
        {
          id: "recent",
          title: "Recent item",
          accessory: "5 minutes ago",
          actions: [{ type: "custom", id: "copy-item", label: "Copy", icon: "lucide:copy" }],
        },
      ],
    }

    render(<ViewRenderer view={view} onAction={onAction} />)

    expect(screen.getByText("5 minutes ago")).toBeInTheDocument()
    expect(screen.queryByText("✓")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Action" })).not.toBeInTheDocument()
  })

  it("submits form values through the submit action", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const view: RenderablePluginView = {
      type: "form",
      fields: [
        {
          id: "name",
          type: "text",
          label: "Name",
          default: "initial",
        },
      ],
      submitLabel: "Save",
      actions: [{ type: "submit", label: "Save" }],
    }

    render(<ViewRenderer view={view} onAction={onAction} />)
    await user.clear(screen.getByLabelText("Name"))
    await user.type(screen.getByLabelText("Name"), "DesKit")
    await user.click(screen.getByRole("button", { name: /save/i }))

    expect(onAction).toHaveBeenCalledWith(view.actions?.[0], {
      values: { name: "DesKit" },
    })
  })
})
