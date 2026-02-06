import { resourceLabel } from "../utils/i18n";
import type { ResourceCard } from "../utils/api.types";
import ConstructionIcon from "@mui/icons-material/Construction";

import "./BuildCostGuide.scss";
import CollapsibleSection from "./CollapsibleSection";

type CostEntry = {
  key: string;
  label: string;
  resources: {
    type: ResourceCard;
    amount: number;
  }[];
};

const BUILD_COSTS: CostEntry[] = [
  {
    key: "ROAD",
    label: "街道",
    resources: [
      { type: "WOOD", amount: 1 },
      { type: "BRICK", amount: 1 },
    ],
  },
  {
    key: "SETTLEMENT",
    label: "開拓地",
    resources: [
      { type: "WOOD", amount: 1 },
      { type: "BRICK", amount: 1 },
      { type: "SHEEP", amount: 1 },
      { type: "WHEAT", amount: 1 },
    ],
  },
  {
    key: "CITY",
    label: "都市",
    resources: [
      { type: "WHEAT", amount: 2 },
      { type: "ORE", amount: 3 },
    ],
  },
  {
    key: "DEVELOPMENT",
    label: "開発カード",
    resources: [
      { type: "SHEEP", amount: 1 },
      { type: "WHEAT", amount: 1 },
      { type: "ORE", amount: 1 },
    ],
  },
];

export default function BuildCostGuide() {
  return (
    <CollapsibleSection
      className="build-cost-guide"
      title={
        <span className="build-cost-title">
          <ConstructionIcon fontSize="small" />
          <span>建設コスト早見表</span>
        </span>
      }
    >
      <div className="cost-list">
        {BUILD_COSTS.map((entry) => (
          <div className="cost-row" key={entry.key}>
            <div className="cost-label">{entry.label}</div>
            <div className="cost-resources">
              {entry.resources.map(({ type, amount }, index) => (
                <div
                  key={`${entry.key}-${type}-${index}`}
                  className={`resource-chip ${type.toLowerCase()}`}
                >
                  <span className="chip-name">{resourceLabel(type)}</span>
                  <span className="chip-count">×{amount}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
