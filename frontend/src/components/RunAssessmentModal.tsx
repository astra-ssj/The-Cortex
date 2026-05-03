import { useEffect, useMemo, useState } from "react";
import { FRAMEWORK_IDS_ORDERED, frameworkLabelFromId } from "../lib/frameworkRegistry";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Modal } from "./ui/Modal";

export type RunAssessmentFramework = { id: string; name: string };

const REGISTRY_LIST: RunAssessmentFramework[] = FRAMEWORK_IDS_ORDERED.map((id) => ({
  id,
  name: frameworkLabelFromId(id),
}));

export interface RunAssessmentModalProps {
  open: boolean;
  onClose: () => void;
  frameworks?: RunAssessmentFramework[] | null;
  disabled?: boolean;
  onConfirm: (frameworkIds: string[]) => void;
}

export function RunAssessmentModal({
  open,
  onClose,
  frameworks,
  disabled = false,
  onConfirm,
}: RunAssessmentModalProps) {
  const displayFrameworks = useMemo(() => {
    if (frameworks !== undefined && frameworks !== null && frameworks.length > 0) {
      return frameworks;
    }
    return REGISTRY_LIST;
  }, [frameworks]);

  const allIds = useMemo(() => displayFrameworks.map((f) => f.id), [displayFrameworks]);

  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelectedFrameworks(allIds.length > 0 ? [...allIds] : []);
    }
  }, [open, allIds]);

  function toggleFramework(id: string, checked: boolean) {
    setSelectedFrameworks((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  }

  function handleConfirm() {
    onConfirm(selectedFrameworks);
    onClose();
  }

  const n = selectedFrameworks.length;
  const suffix = n === 1 ? "" : "s";

  return (
    <Modal size="md" open={open} onClose={onClose}>
      <Modal.Header onClose={onClose}>Run Assessment</Modal.Header>
      <Modal.Body>
        <p className="mb-3 text-sm text-cortex-text-sec">Select frameworks to assess:</p>
        <div className="flex flex-col gap-2.5">
          {displayFrameworks.map((fw) => (
            <Checkbox
              key={fw.id}
              label={fw.name}
              checked={selectedFrameworks.includes(fw.id)}
              disabled={disabled}
              onChange={(checked) => {
                toggleFramework(fw.id, checked);
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setSelectedFrameworks([...allIds]);
            }}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setSelectedFrameworks([]);
            }}
          >
            Clear
          </Button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={disabled || n === 0}
          onClick={handleConfirm}
        >
          Assess {n} framework{suffix}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
