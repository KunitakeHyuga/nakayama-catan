import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "../pages/Board";
import type { GameState } from "../utils/api.types";

import "./BoardSnapshot.scss";

type BoardSnapshotProps = {
  gameState: GameState;
};

const MIN_BOARD_WIDTH = 320;
const MAX_BOARD_WIDTH = 1150;
const MIN_BOARD_HEIGHT = 360;
const BOARD_ASPECT_RATIO = 0.62;
const BOARD_VERTICAL_OFFSET = 144 + 38 + 40;

function assignRef<T>(
  ref: React.ForwardedRef<T>,
  value: T
) {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

const BoardSnapshot = forwardRef<HTMLDivElement, BoardSnapshotProps>(
  ({ gameState }, forwardedRef) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [boardWidth, setBoardWidth] = useState(480);
    const [boardHeight, setBoardHeight] = useState(320);

    const computeDimensions = useMemo(
      () =>
        (containerWidth: number, containerHeight?: number) => {
          const effectiveWidth = Math.min(
            Math.max(containerWidth - 16, MIN_BOARD_WIDTH),
            MAX_BOARD_WIDTH
          );
          const baseHeight = Math.max(
            effectiveWidth * BOARD_ASPECT_RATIO,
            MIN_BOARD_HEIGHT
          );
          const heightFromContainer =
            containerHeight && containerHeight > 0
              ? Math.max(baseHeight, containerHeight - 16)
              : baseHeight;
          return { width: effectiveWidth, height: heightFromContainer };
        },
      []
    );

    useEffect(() => {
      if (typeof window === "undefined") {
        return;
      }
      const update = () => {
        const containerWidth =
          containerRef.current?.clientWidth ?? window.innerWidth;
        const containerHeight =
          containerRef.current?.clientHeight ?? window.innerHeight;
        const { width, height } = computeDimensions(
          containerWidth,
          containerHeight
        );
        setBoardWidth(width);
        setBoardHeight(height);
      };
      update();
      const observer =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
      if (observer && containerRef.current) {
        observer.observe(containerRef.current);
      }
      window.addEventListener("resize", update);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", update);
      };
    }, [computeDimensions]);

    const buildNodeNoop =
      (_id?: number) =>
      () =>
        undefined;
    const buildEdgeNoop =
      (_id?: [number, number]) =>
      () =>
        undefined;
    const setBoardWrapperRef = useCallback(
      (node: HTMLDivElement | null) => {
        assignRef(forwardedRef, node);
      },
      [forwardedRef]
    );

    return (
      <div className="board-snapshot" ref={containerRef}>
        <div
          className="board-wrapper"
          style={{ width: boardWidth, height: boardHeight }}
          ref={setBoardWrapperRef}
        >
          <Board
            width={boardWidth}
            height={boardHeight + BOARD_VERTICAL_OFFSET}
            buildOnNodeClick={buildNodeNoop}
            buildOnEdgeClick={buildEdgeNoop}
            handleTileClick={() => undefined}
            nodeActions={{}}
            edgeActions={{}}
            replayMode={true}
            gameState={gameState}
            isMobile={false}
            show={true}
            isMovingRobber={false}
          />
        </div>
      </div>
    );
  }
);

BoardSnapshot.displayName = "BoardSnapshot";

export default BoardSnapshot;
