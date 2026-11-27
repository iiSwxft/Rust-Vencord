/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButtonsHost } from "@api/HeaderBar";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HeaderBarAPI",
    description: "API that lets plugins add buttons to Discord's header toolbar",
    authors: [{ name: "P", id: 0n }],
    required: true,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?\i\.Fragment,(?:[$\w.]+,)*\{children:\[)/,
                replace: "$1$self.renderHeaderBarButtons(),"
            }
        }
    ],

    renderHeaderBarButtons() {
        return <HeaderBarButtonsHost />;
    }
});
