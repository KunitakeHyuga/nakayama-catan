import {
  useCallback,
  createContext,
  useMemo,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  PropsWithChildren,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { Link } from "react-router-dom";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import Drawer from "@mui/material/Drawer";
import Button from "@mui/material/Button";
import { isTabOrShift, type InteractionEvent } from "../utils/events";

import Hidden from "./Hidden";
import { store } from "../store";
import ACTIONS from "../actions";

import "./RightDrawer.scss";

const DEFAULT_DESKTOP_WIDTH = 420;
const MIN_DESKTOP_WIDTH = 260;
const MAX_DESKTOP_WIDTH = 600;

type RightDrawerSizingContextValue = {
  requestWidth: (width: number) => void;
};

export const RightDrawerSizingContext =
  createContext<RightDrawerSizingContextValue | null>(null);

function clampDesktopWidth(value: number): number {
  const viewportCap =
    typeof window === "undefined"
      ? MAX_DESKTOP_WIDTH
      : Math.round(window.innerWidth * 0.9);
  const effectiveMax = Math.min(MAX_DESKTOP_WIDTH, viewportCap);
  return Math.max(MIN_DESKTOP_WIDTH, Math.min(value, effectiveMax));
}

export default function RightDrawer( { children }: PropsWithChildren ) {
  const { state, dispatch } = useContext(store);
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [desktopWidth, setDesktopWidth] = useState(() =>
    clampDesktopWidth(DEFAULT_DESKTOP_WIDTH)
  );
  const [isResizing, setIsResizing] = useState(false);
  const sizingContextValue = useMemo(
    () => ({
      requestWidth: (width: number) => {
        setDesktopWidth(clampDesktopWidth(width));
      },
    }),
    []
  );

  const openRightDrawer = useCallback(
    (event: InteractionEvent) => {
      if (isTabOrShift(event)) {
        return;
      }

      dispatch({ type: ACTIONS.SET_RIGHT_DRAWER_OPENED, data: true });
    },
    [dispatch]
  );

  const closeRightDrawer = useCallback(
    (event: InteractionEvent) => {
      if (isTabOrShift(event)) {
        return;
      }

      dispatch({ type: ACTIONS.SET_RIGHT_DRAWER_OPENED, data: false });
    },
    [dispatch]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleWindowResize = () => {
      setDesktopWidth((prev) => clampDesktopWidth(prev));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--right-drawer-width", `${desktopWidth}px`);
    return () => {
      root.style.removeProperty("--right-drawer-width");
    };
  }, [desktopWidth]);

  const handleResizeStart = useCallback(
    (
      event:
        | ReactMouseEvent<HTMLDivElement>
        | ReactTouchEvent<HTMLDivElement>
    ) => {
      if (typeof window === "undefined") {
        return;
      }
      if ("button" in event && event.button !== 0) {
        return;
      }
      event.preventDefault();
      const startClientX =
        "touches" in event ? event.touches[0]?.clientX ?? 0 : event.clientX;
      const startWidth = desktopWidth;
      setIsResizing(true);

      const updateWidthFromClientX = (clientX: number) => {
        const delta = startClientX - clientX;
        setDesktopWidth(clampDesktopWidth(startWidth + delta));
      };

      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        updateWidthFromClientX(moveEvent.clientX);
        moveEvent.preventDefault();
      };

      const handleTouchMove = (moveEvent: globalThis.TouchEvent) => {
        if (moveEvent.touches.length === 0) {
          return;
        }
        updateWidthFromClientX(moveEvent.touches[0].clientX);
        moveEvent.preventDefault();
      };

      const stopResizing = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", stopResizing);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", stopResizing);
        window.removeEventListener("touchcancel", stopResizing);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stopResizing);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", stopResizing);
      window.addEventListener("touchcancel", stopResizing);
    },
    [desktopWidth]
  );

  const renderDrawerContent = (fullWidthButton: boolean) => (
    <div className="drawer-content">
      <Button
        component={Link}
        to="/"
        variant="contained"
        color="secondary"
        className="drawer-home-btn"
        fullWidth={fullWidthButton}
      >
        ホームに戻る
      </Button>
      {children}
    </div>
  );

  return (
    <RightDrawerSizingContext.Provider value={sizingContextValue}>
      <>
        <Hidden breakpoint={{ size: "lg", direction: "up" }} implementation="js">
          <SwipeableDrawer
            className="right-drawer"
            anchor="right"
            open={state.isRightDrawerOpen}
            onClose={closeRightDrawer}
            onOpen={openRightDrawer}
            disableBackdropTransition={!iOS}
            disableDiscovery={iOS}
            onKeyDown={closeRightDrawer}
          >
            {renderDrawerContent(false)}
          </SwipeableDrawer>
        </Hidden>
        <Hidden
          breakpoint={{ size: "md", direction: "down" }}
          implementation="css"
        >
          <Drawer
            className="right-drawer"
            anchor="right"
            variant="permanent"
            open
            PaperProps={{ style: { width: `${desktopWidth}px` } }}
          >
            <div className="drawer-shell">
              <div
                className={`drawer-resize-handle${
                  isResizing ? " is-resizing" : ""
                }`}
                role="separator"
                aria-orientation="vertical"
                aria-label="右側パネルの幅を調整"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                <span className="handle-grip" />
              </div>
              {renderDrawerContent(true)}
            </div>
          </Drawer>
        </Hidden>
      </>
    </RightDrawerSizingContext.Provider>
  );
}
