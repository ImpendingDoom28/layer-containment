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
  return (
    <div className="grid grid-cols-2 gap-2">
      <EditorField label="Grid X">
        <UIInput
          type="number"
          value={gridX}
          onChange={(event) => onChangeGridX(Number(event.target.value) || 0)}
        />
      </EditorField>
      <EditorField label="Grid Z">
        <UIInput
          type="number"
          value={gridZ}
          onChange={(event) => onChangeGridZ(Number(event.target.value) || 0)}
        />
      </EditorField>
    </div>
  );
};
