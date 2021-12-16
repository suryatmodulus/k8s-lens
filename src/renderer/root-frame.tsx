/**
 * Copyright (c) 2021 OpenLens Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { injectSystemCAs } from "../common/system-ca";
import React from "react";
import { Route, Router, Switch } from "react-router";
import { observer } from "mobx-react";
import { history } from "./navigation";
import { ClusterManager } from "./components/cluster-manager";
import { ErrorBoundary } from "./components/error-boundary";
import { Notifications } from "./components/notifications";
import { ConfirmDialog } from "./components/confirm-dialog";
import type { ExtensionLoader } from "../extensions/extension-loader";
import { broadcastMessage, BundledExtensionsLoaded } from "../common/ipc";
import { CommandContainer } from "./components/command-palette/command-container";
import { registerIpcListeners } from "./ipc";
import { ipcRenderer } from "electron";
import { IpcRendererNavigationEvents } from "./navigation/events";
import { catalogEntityRegistry } from "./api/catalog-entity-registry";
import logger from "../common/logger";
import { unmountComponentAtNode } from "react-dom";
import { ClusterFrameHandler } from "./components/cluster-manager/lens-views";
import type { LensProtocolRouterRenderer } from "./protocol-handler";
import { delay } from "./utils";

injectSystemCAs();

@observer
export class RootFrame extends React.Component {
  static readonly logPrefix = "[ROOT-FRAME]:";
  static displayName = "RootFrame";

  static async init(
    rootElem: HTMLElement,
    extensionLoader: ExtensionLoader,
    bindProtocolAddRouteHandlers: () => void,
    lensProtocolRouterRendererInjectable: LensProtocolRouterRenderer,
  ) {
    catalogEntityRegistry.init();

    try {
      // maximum time to let bundled extensions finish loading
      const timeout = delay(10000);

      const loadingExtensions = extensionLoader.loadOnClusterManagerRenderer();
      const loadingBundledExtensions = loadingExtensions.filter(e => e.isBundled).map(e => e.loaded);
      const bundledExtensionsFinished = Promise.all(loadingBundledExtensions);

      await Promise.race([bundledExtensionsFinished, timeout]);
    } finally {
      ipcRenderer.send(BundledExtensionsLoaded);
    }
    lensProtocolRouterRendererInjectable.init();

    bindProtocolAddRouteHandlers();

    window.addEventListener("offline", () => broadcastMessage("network:offline"));
    window.addEventListener("online", () => broadcastMessage("network:online"));

    registerIpcListeners();

    window.addEventListener("beforeunload", () => {
      logger.info(`${RootFrame.logPrefix} Unload app`);
      unmountComponentAtNode(rootElem);
    });
  }

  constructor(props: {}) {
    super(props);

    ClusterFrameHandler.createInstance();
  }

  componentDidMount() {
    ipcRenderer.send(IpcRendererNavigationEvents.LOADED);
  }

  render() {
    return (
      <Router history={history}>
        <ErrorBoundary>
          <Switch>
            <Route component={ClusterManager} />
          </Switch>
        </ErrorBoundary>
        <Notifications />
        <ConfirmDialog />
        <CommandContainer />
      </Router>
    );
  }
}