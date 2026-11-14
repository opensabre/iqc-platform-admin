import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import Antd from "ant-design-vue";
import type { TaskTrigger } from "@/api/tasks";
import TaskTriggerConfiguration from "./TaskTriggerConfiguration.vue";
let app: App, root: HTMLDivElement;
async function settle() { for (let i = 0; i < 5; i++) await nextTick(); }
function mount(initial: TaskTrigger, disabled = false) {
  const model = ref(initial); root = document.createElement("div"); document.body.append(root);
  app = createApp({ render: () => h(TaskTriggerConfiguration, { modelValue: model.value, disabled,
    "onUpdate:modelValue": value => { model.value = value; } }) }).use(Antd);
  app.mount(root); return model;
}
afterEach(() => { app?.unmount(); root?.remove(); });
describe("unified trigger configuration", () => {
  it("clears fields from the previous trigger type and preserves enabled state", async () => {
    const model = mount({ type: "SCHEDULED", scheduledAt: "2030-01-01T09:00", enabled: false }); await settle();
    root.querySelector<HTMLInputElement>('input[value="PERIODIC"]')!.click(); await settle();
    expect(model.value).toEqual({ type: "PERIODIC", enabled: false });
    const cron = root.querySelector<HTMLInputElement>('input[placeholder^="例如"]')!;
    cron.value = "0 0 9 * * *"; cron.dispatchEvent(new Event("input", { bubbles: true })); await settle();
    expect(model.value.cron).toBe("0 0 9 * * *");
    root.querySelector<HTMLButtonElement>('button[role="switch"]')!.click(); await settle();
    expect(model.value.enabled).toBe(true); expect(root.textContent).toContain("北京时间");
  });
  it("disables all trigger controls while submitting", async () => {
    mount({ type: "SCHEDULED", scheduledAt: "2030-01-01T09:00", enabled: true }, true); await settle();
    expect([...root.querySelectorAll<HTMLInputElement>("input")].every(input => input.disabled)).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[role="switch"]')!.disabled).toBe(true);
  });
});
