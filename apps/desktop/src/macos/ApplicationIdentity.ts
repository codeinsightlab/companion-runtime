import type { MenuItemConstructorOptions } from "electron";

export const COMPANION_APPLICATION_NAME = "Companion";

export interface MacApplicationIdentityHost {
  readonly dock?: {
    show(): Promise<void>;
  };
  setActivationPolicy(policy: "regular"): void;
  setName(name: string): void;
  whenReady(): Promise<void>;
}

export interface MacApplicationMenuHost {
  buildFromTemplate(template: MenuItemConstructorOptions[]): unknown;
  setApplicationMenu(menu: unknown): void;
}

export interface MacApplicationIdentityOptions {
  readonly application: MacApplicationIdentityHost;
  readonly menu: MacApplicationMenuHost;
  readonly requestQuit: () => Promise<void>;
}

export function createMacApplicationMenuTemplate(
  requestQuit: () => Promise<void>
): MenuItemConstructorOptions[] {
  return [
    {
      label: COMPANION_APPLICATION_NAME,
      submenu: [
        { label: `About ${COMPANION_APPLICATION_NAME}`, role: "about" },
        { type: "separator" },
        { label: `Hide ${COMPANION_APPLICATION_NAME}`, role: "hide" },
        { type: "separator" },
        {
          label: `Quit ${COMPANION_APPLICATION_NAME}`,
          accelerator: "Command+Q",
          click: () => {
            void requestQuit();
          }
        }
      ]
    },
    {
      label: "Window",
      submenu: [
        { label: "Close", accelerator: "Command+W", role: "close" }
      ]
    }
  ];
}

export async function installMacApplicationIdentity({
  application,
  menu,
  requestQuit
}: MacApplicationIdentityOptions): Promise<void> {
  application.setName(COMPANION_APPLICATION_NAME);
  await application.whenReady();
  application.setActivationPolicy("regular");
  await application.dock?.show();
  menu.setApplicationMenu(menu.buildFromTemplate(createMacApplicationMenuTemplate(requestQuit)));
}
