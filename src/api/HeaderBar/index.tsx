/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { useForceUpdater } from "@utils/react";
import { findComponentByCodeLazy } from "@webpack";
import { useEffect } from "@webpack/common";
import type { ReactNode } from "react";

const HeaderBarIcon: any = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

export interface HeaderBarButtonProps {
    icon: any;
    tooltip?: ReactNode;
    onClick?: () => void;
    className?: string;
    selected?: boolean;
    [key: string]: any;
}

/** A button in Discord's top right header toolbar. Register via addHeaderBarButton. */
export function HeaderBarButton(props: HeaderBarButtonProps) {
    return <HeaderBarIcon {...props} />;
}

interface RegisteredButton {
    render: () => ReactNode;
    priority: number;
}

const buttons = new Map<string, RegisteredButton>();
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        try { listener(); } catch { }
    }
}

/**
 * Adds a button to Discord's header toolbar. Call from your plugin's start().
 * Higher priority sorts further left.
 */
export function addHeaderBarButton(id: string, render: () => ReactNode, priority = 0): void {
    buttons.set(id, { render, priority });
    notify();
}

/** Removes a button registered with addHeaderBarButton. Call from your plugin's stop(). */
export function removeHeaderBarButton(id: string): void {
    if (buttons.delete(id)) notify();
}

export function HeaderBarButtonsHost() {
    const forceUpdate = useForceUpdater();
    useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, [forceUpdate]);

    const sorted = [...buttons.entries()].sort((a, b) => b[1].priority - a[1].priority);
    return <>{sorted.map(([id, button]) => <ErrorBoundary key={id} noop>{button.render()}</ErrorBoundary>)}</>;
}
