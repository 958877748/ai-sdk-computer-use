import { getOrCreateDesktop, getCurrentDesktop, connectDesktop } from "@/lib/e2b/desktop";

export async function getDesktopURL(id?: string) {
  let desktop;
  
  if (id) {
    desktop = await connectDesktop(id);
  }
  
  if (!desktop) {
    desktop = await getOrCreateDesktop();
  }
  
  await desktop.stream.start();
  const streamUrl = desktop.stream.getUrl();
  
  return { streamUrl, id: desktop.sandboxId };
}

export async function killDesktop(id?: string) {
  const desktop = getCurrentDesktop();
  if (desktop && (!id || desktop.sandboxId === id)) {
    await desktop.kill();
  }
}
