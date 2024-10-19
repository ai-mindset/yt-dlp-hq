import { assertEquals } from "jsr:@std/assert";
import { assertSpyCalls, spy, stub } from "jsr:@std/testing/mock";
import { checkPackageInstalled } from "./main.ts";

Deno.test("checkPackageInstalled", async (t) => {
  await t.step("returns true for installed package", async () => {
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.resolve({ code: 0 }),
    }));
    const commandSpy = spy(commandStub);

    try {
      const result = await checkPackageInstalled("uname");
      assertEquals(result, true);
      assertSpyCalls(commandSpy, 1);
      assertEquals(commandSpy.calls[0].args, ["uname", { args: ["--help"] }]);
    } finally {
      commandStub.restore();
    }
  });

  await t.step("returns false for not installed package", async () => {
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.reject(new Error("Command not found")),
    }));
    const commandSpy = spy(commandStub);

    try {
      const result = await checkPackageInstalled("not-installed-package");
      assertEquals(result, false);
      assertSpyCalls(commandSpy, 1);
      assertEquals(commandSpy.calls[0].args, ["not-installed-package", { args: ["--help"] }]);
    } finally {
      commandStub.restore();
    }
  });
});
