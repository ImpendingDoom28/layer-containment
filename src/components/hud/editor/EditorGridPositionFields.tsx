import { useTranslation } from "react-i18next";
import { parseNumberInputOr } from "../../../utils/parseNumberInput";
import { UIInput } from "../../ui/UIInput";

import { EditorField } from "./EditorField";

type EditorGridPositionFieldsProps = {
  gridX: number;
  gridZ: number;
  onChangeGridX: (value: number) => void;
  onChangeGridZ: (value: number) => void;
};

export const EditorGridPositionFields = ({
  gridX,
  gridZ,
  onChangeGridX,
  onChangeGridZ,
}: EditorGridPositionFieldsProps) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      <EditorField label={t("editor.gridX")}>
        <UIInput
          type="number"
          value={gridX}
          onChange={(event) => onChangeGridX(parseNumberInputOr(event, 0))}
        />
      </EditorField>
      <EditorField label={t("editor.gridZ")}>
        <UIInput
          type="number"
          value={gridZ}
          onChange={(event) => onChangeGridZ(parseNumberInputOr(event, 0))}
        />
      </EditorField>
    </div>
  );
};
