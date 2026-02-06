import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Typography, Paper } from "@mui/material";

import Tile from "../pages/Tile";
import type { BoardPreview } from "../utils/api.types";
import { SQRT3 } from "../utils/coordinates";

import "./RoomBoardPreview.scss";

const computeDefaultSize = (divWidth: number, divHeight: number): number => {
  const numLevels = 6;
  const maxSizeThatRespectsHeight = (4 * divHeight) / (3 * numLevels + 1) / 2;
  const correspondingWidth = SQRT3 * maxSizeThatRespectsHeight;
  let size: number;
  if (numLevels * correspondingWidth < divWidth) {
    size = maxSizeThatRespectsHeight;
  } else {
    const maxSizeThatRespectsWidth = divWidth / numLevels / SQRT3;
    size = maxSizeThatRespectsWidth;
  }
  return size;
};

type RoomBoardPreviewProps = {
  preview?: BoardPreview | null;
  canShuffle: boolean;
  refreshing?: boolean;
  onShuffle?: () => void;
};

const noop = () => {};

export default function RoomBoardPreview({
  preview,
  canShuffle,
  refreshing = false,
  onShuffle,
}: RoomBoardPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 240 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const updateSize = () => {
      const width = element.clientWidth || 320;
      const height = element.clientHeight || width;
      setDimensions({ width, height });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const renderTiles = useMemo(() => {
    if (!preview) {
      return null;
    }
    const { width, height } = dimensions;
    const center: [number, number] = [width / 2, height / 2];
    const size = computeDefaultSize(width, height);
    return preview.tiles.map(({ coordinate, tile }) => (
      <Tile
        key={`${coordinate}`}
        center={center}
        coordinate={coordinate}
        tile={tile}
        size={size}
        flashing={false}
        onClick={noop}
        robberHighlight={false}
        diceHighlight={false}
      />
    ));
  }, [preview, dimensions]);

  return (
    <Paper className="room-board-preview" elevation={2}>
      <div className="header">
        <Typography variant="subtitle1">盤面プレビュー</Typography>
        {canShuffle && (
          <Button
            variant="outlined"
            size="small"
            onClick={onShuffle}
            disabled={refreshing}
          >
            {refreshing ? "更新中..." : "盤面を更新"}
          </Button>
        )}
      </div>
      <div className="preview-area" ref={containerRef}>
        {preview ? (
          renderTiles
        ) : (
          <Typography variant="body2" color="text.secondary">
            盤面を読み込み中です…
          </Typography>
        )}
      </div>
    </Paper>
  );
}
