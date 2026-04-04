import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  chemicalAssignmentAPI,
  chemicalStockAPI,
  equipmentAPI,
  equipmentCategoryAPI,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  canApproveChemicalAssignment,
  canManageChemicalInventory,
  normalizeUserRole,
} from "@/lib/auth/role";

// Map display labels from stock API to backend filter keys
const LOCATION_DISPLAY_TO_KEY: Record<string, string> = {
  "Water system": "water_system",
  "Cooling towers": "cooling_towers",
  "Boiler": "boiler",
};
function locationDisplayToKey(display: string): string {
  const key = LOCATION_DISPLAY_TO_KEY[display];
  if (key) return key;
  const lower = display.trim().toLowerCase();
  if (lower.includes("water") && !lower.includes("cooling")) return "water_system";
  if (lower.includes("cooling")) return "cooling_towers";
  if (lower === "boiler") return "boiler";
  return display;
}

interface AssignmentRow {
  id: string;
  chemical: string;
  chemical_name: string;
  chemical_formula: string;
  location: string;
  equipment_name: string;
  category: "major" | "minor";
  is_active: boolean;
  status?: "pending" | "approved" | "rejected";
  created_by_id?: string | null;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  rejected_by_name?: string | null;
  rejection_comment?: string | null;
}

interface EquipmentOption {
  id: string;
  equipment_number: string;
  name: string;
  department?: string;
  department_name?: string;
}

const ChemicalAssignmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageAssignments = canManageChemicalInventory(user?.role);
  const canApproveAssignments = canApproveChemicalAssignment(user?.role);
  const isSuperAdmin = normalizeUserRole(user?.role) === "super_admin";

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [approveCommentOpen, setApproveCommentOpen] = useState(false);
  const [rejectCommentOpen, setRejectCommentOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState("");
  const [rejectComment, setRejectComment] = useState("");

  const [form, setForm] = useState<{
    location: string;
    chemicalFormula: string;
    chemicalName: string;
    department: string;
    equipmentName: string;
    category: "major" | "minor" | "";
    selectedChemicalId: string | null;
  }>({
    location: "",
    chemicalFormula: "",
    chemicalName: "",
    department: "",
    equipmentName: "",
    category: "",
    selectedChemicalId: null,
  });

  const [stockByLocation, setStockByLocation] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [locationsFromStock, setLocationsFromStock] = useState<{ value: string; label: string }[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [allEquipmentOptions, setAllEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);

  const visibleRows = useMemo(() => {
    if (allEquipmentOptions.length === 0) return rows;
    const masterNames = new Set<string>();
    allEquipmentOptions.forEach((eq) => {
      const n = (eq.name || "").trim();
      const num = (eq.equipment_number || "").trim();
      if (n) masterNames.add(n.toLowerCase());
      if (num) masterNames.add(num.toLowerCase());
      if (num || n) masterNames.add(`${num} – ${n || num}`.trim().toLowerCase());
    });
    return rows.filter((r) => masterNames.has((r.equipment_name || "").trim().toLowerCase()));
  }, [rows, allEquipmentOptions]);

  const loadAssignments = async () => {
    setIsLoading(true);
    try {
      const data = await chemicalAssignmentAPI.list();
      setRows(data as any);
    } catch (error: any) {
      console.error("Failed to load assignments:", error);
      toast.error(error?.message || "Failed to load assignments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, []);

  // Load approved, active equipments from equipment list (excluding chillers) for Equipment dropdown
  useEffect(() => {
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as {
          id: string;
          name: string;
        }[];
        const chillerCategoryIds = new Set(
          categories
            .filter((c) => /^chiller(s)?$/i.test((c.name || "").trim()))
            .map((c) => c.id)
        );

        const list = (await equipmentAPI.list({ status: "approved" })) as any[];

        const options: EquipmentOption[] = (list || [])
          .filter((e: any) => {
            if (e?.is_active === false) return false;
            if (e?.status !== "approved") return false;
            if (e?.category && chillerCategoryIds.has(e.category)) return false;
            return true;
          })
          .map((e: any) => ({
            id: e.id,
            equipment_number: e.equipment_number,
            name: e.name || "",
            department: e.department || "",
            department_name: e.department_name || "",
          }));

        setAllEquipmentOptions(options);
        setEquipmentOptions(options);
        const seen = new Set<string>();
        const departments = options
          .filter((eq) => eq.department)
          .map((eq) => ({
            value: eq.department as string,
            label: (eq.department_name || eq.department || "").trim(),
          }))
          .filter((d) => {
            const key = `${d.value}::${d.label}`.toLowerCase();
            if (!d.value || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        setDepartmentOptions(departments);
      } catch (error) {
        console.error("Failed to load chemical equipment list:", error);
        setAllEquipmentOptions([]);
        setEquipmentOptions([]);
        setDepartmentOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.department) {
      setEquipmentOptions(allEquipmentOptions);
      return;
    }
    const filtered = allEquipmentOptions.filter((eq) => eq.department === form.department);
    setEquipmentOptions(filtered);
    setForm((prev) => {
      if (!prev.equipmentName) return prev;
      const exists = filtered.some(
        (eq) => `${eq.equipment_number} – ${eq.name || eq.equipment_number}` === prev.equipmentName
      );
      return exists ? prev : { ...prev, equipmentName: "" };
    });
  }, [form.department, allEquipmentOptions]);

  // Load distinct locations from stock details (only locations that have stock entries)
  useEffect(() => {
    let cancelled = false;
    chemicalStockAPI
      .list()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const seen = new Set<string>();
        const locations: { value: string; label: string }[] = [];
        for (const row of list) {
          const display = String(row.location ?? "").trim();
          if (!display || seen.has(display)) continue;
          seen.add(display);
          const key = locationDisplayToKey(display);
          locations.push({ value: key, label: display });
        }
        locations.sort((a, b) => a.label.localeCompare(b.label));
        setLocationsFromStock(locations);
      })
      .catch(() => {
        if (!cancelled) setLocationsFromStock([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When location is selected, fetch stock for that location so we can show chemical dropdown
  useEffect(() => {
    if (!form.location) {
      setStockByLocation([]);
      return;
    }
    let cancelled = false;
    setStockLoading(true);
    chemicalStockAPI
      .list({ location: form.location })
      .then((data) => {
        if (!cancelled) setStockByLocation(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStockByLocation([]);
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.location]);

  // Unique chemicals from stock (by chemical id) for dropdown
  const chemicalsFromStock = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; chemical_name: string; chemical_formula: string; display: string }[] = [];
    for (const row of stockByLocation) {
      const id = row.chemical ?? row.chemical_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(row.chemical_name ?? "").trim();
      const formula = String(row.chemical_formula ?? "").trim();
      out.push({
        id,
        chemical_name: name,
        chemical_formula: formula,
        display: formula ? `${formula} – ${name}` : name || id,
      });
    }
    return out.sort((a, b) => a.display.localeCompare(b.display));
  }, [stockByLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chemicalName = form.chemicalName.trim();
    const equipmentName = form.equipmentName.trim();
    if (!chemicalName) {
      toast.error("Please enter chemical name.");
      return;
    }
    if (!form.department) {
      toast.error("Please select department.");
      return;
    }
    if (!equipmentName) {
      toast.error("Equipment is required.");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category (Major/Minor).");
      return;
    }
    const isExactDuplicateAssignment = rows.some((r) => {
      const sameEquipment =
        (r.equipment_name || "").trim().toLowerCase() === equipmentName.trim().toLowerCase();
      const sameCategory =
        (r.category || "").trim().toLowerCase() === (form.category || "").trim().toLowerCase();
      const rowChemicalName = (r.chemical_name || "").trim().toLowerCase();
      const sameChemical =
        rowChemicalName === chemicalName.trim().toLowerCase() ||
        (!!form.selectedChemicalId && r.chemical === form.selectedChemicalId);
      return sameEquipment && sameCategory && sameChemical;
    });
    if (isExactDuplicateAssignment) {
      toast.error("This chemical is already assigned to this equipment for the selected category.");
      return;
    }
    try {
      await chemicalAssignmentAPI.create({
        chemical: form.selectedChemicalId || undefined,
        location: form.location.trim() || undefined,
        chemical_formula: form.chemicalFormula.trim() || undefined,
        chemical_name: chemicalName,
        equipment_name: equipmentName,
        category: form.category,
      });
      toast.success("Chemical assigned to equipment.");
      setForm({
        location: "",
        chemicalFormula: "",
        chemicalName: "",
        department: "",
        equipmentName: "",
        category: "",
        selectedChemicalId: null,
      });
      await loadAssignments();
    } catch (error: any) {
      console.error("Failed to save assignment:", error);
      toast.error(error?.message || "Failed to save assignment");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this chemical assignment?")) return;
    try {
      await chemicalAssignmentAPI.delete(id);
      toast.success("Assignment removed.");
      await loadAssignments();
    } catch (error: any) {
      console.error("Failed to delete assignment:", error);
      toast.error(error?.message || "Failed to delete assignment");
    }
  };

  const handleApproveClick = (row: AssignmentRow) => {
    if (row.created_by_id && row.created_by_id === user?.id) {
      toast.error("The assignment must be approved or rejected by a different user than the creator (Created by).");
      return;
    }
    setSelectedAssignmentId(row.id);
    setApproveConfirmOpen(true);
  };

  const handleRejectClick = (row: AssignmentRow) => {
    if (row.created_by_id && row.created_by_id === user?.id) {
      toast.error("The assignment must be approved or rejected by a different user than the creator (Created by).");
      return;
    }
    setSelectedAssignmentId(row.id);
    setRejectConfirmOpen(true);
  };

  const handleApproveConfirmToComment = () => {
    setApproveConfirmOpen(false);
    setApproveCommentOpen(true);
  };

  const handleApproveSubmit = async () => {
    if (!selectedAssignmentId) return;
    const comment = approveComment.trim();
    if (!comment) {
      toast.error("Comment is required for approval.");
      return;
    }
    try {
      await chemicalAssignmentAPI.approve(selectedAssignmentId, "approve", comment);
      setApproveCommentOpen(false);
      setApproveComment("");
      setSelectedAssignmentId(null);
      toast.success("Assignment approved.");
      await loadAssignments();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || "Failed to approve assignment");
    }
  };

  const handleRejectConfirmToComment = () => {
    setRejectConfirmOpen(false);
    setRejectCommentOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedAssignmentId) return;
    const comment = rejectComment.trim();
    if (!comment) {
      toast.error("Comment is required for rejection.");
      return;
    }
    try {
      await chemicalAssignmentAPI.approve(selectedAssignmentId, "reject", comment);
      setRejectCommentOpen(false);
      setRejectComment("");
      setSelectedAssignmentId(null);
      toast.success("Assignment rejected.");
      await loadAssignments();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || "Failed to reject assignment");
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Equipment Assignment"
        subtitle="Assign chemicals and category to equipment"
      />

      <div className="px-6 pt-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/chemical")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        {!canManageAssignments && (
          <Badge variant="outline" className="text-xs">
            View only – supervisors and above can manage assignments.
          </Badge>
        )}
      </div>

      <main className="p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          {canManageAssignments && (
            <section className="bg-card border border-border rounded-lg p-4 space-y-4">
              <h2 className="text-lg font-semibold">New assignment</h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.location || "__none__"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        location: v === "__none__" ? "" : v,
                        chemicalFormula: "",
                        chemicalName: "",
                        selectedChemicalId: null,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select category</SelectItem>
                      {locationsFromStock.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Categories are loaded from Chemical Stock Details. Chemicals in the selected category appear below.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Chemical (from stock at selected category)</Label>
                  <Select
                    value={form.selectedChemicalId ?? "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setForm((prev) => ({
                          ...prev,
                          selectedChemicalId: null,
                          chemicalName: "",
                          chemicalFormula: "",
                        }));
                        return;
                      }
                      const chem = chemicalsFromStock.find((c) => c.id === v);
                      if (chem) {
                        setForm((prev) => ({
                          ...prev,
                          selectedChemicalId: chem.id,
                          chemicalName: chem.chemical_name,
                          chemicalFormula: chem.chemical_formula,
                        }));
                      }
                    }}
                    disabled={!form.location || stockLoading || chemicalsFromStock.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={stockLoading ? "Loading..." : form.location ? "Select chemical" : "Select category first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select chemical</SelectItem>
                      {chemicalsFromStock.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.location && !stockLoading && chemicalsFromStock.length === 0 && (
                    <p className="text-xs text-amber-600">
                      No stock entries in this category. Add stock in Chemical Stock Details first.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={form.department || "__none__"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        department: v === "__none__" ? "" : v,
                        equipmentName: "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select department</SelectItem>
                      {departmentOptions.map((dep) => (
                        <SelectItem key={dep.value} value={dep.value}>
                          {dep.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="equipment-name">Equipment</Label>
                  <Select
                    value={form.equipmentName || "__none__"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        equipmentName: v === "__none__" ? "" : v,
                      }))
                    }
                    disabled={equipmentOptions.length === 0}
                  >
                    <SelectTrigger id="equipment-name">
                      <SelectValue
                        placeholder={
                          equipmentOptions.length === 0
                            ? (form.department ? "No equipment in selected department" : "Select department first")
                            : "Select equipment"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select equipment</SelectItem>
                      {equipmentOptions.map((eq) => (
                        <SelectItem
                          key={eq.id}
                          value={`${eq.equipment_number} – ${eq.name || eq.equipment_number}`}
                        >
                          {eq.equipment_number}
                          {eq.name ? ` – ${eq.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.department && equipmentOptions.length === 0 && (
                    <p className="text-xs text-amber-600">
                      No approved equipments found for selected department.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        category: v as "major" | "minor",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button type="submit" className="w-full">
                    Save assignment
                  </Button>
                </div>
              </form>
            </section>
          )}

          <section className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold">Current assignments</h2>
              <Badge variant="secondary">
                {visibleRows.length} {visibleRows.length === 1 ? "assignment" : "assignments"}
              </Badge>
            </div>
            <div className="min-w-full overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Equipment
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Chemical
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Created by
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Comment
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Loading assignments...
                      </td>
                    </tr>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No assignments configured yet.
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      // Group by equipment so equipment name appears once (rowSpan)
                      const sorted = [...visibleRows].sort((a, b) =>
                        (a.equipment_name || "").localeCompare(b.equipment_name || "")
                      );
                      const groups = new Map<string, AssignmentRow[]>();
                      sorted.forEach((row) => {
                        const key = row.equipment_name || "";
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(row);
                      });
                      const flat: { row: AssignmentRow; isFirstInGroup: boolean; groupSize: number }[] = [];
                      groups.forEach((groupRows) => {
                        groupRows.forEach((row, i) => {
                          flat.push({
                            row,
                            isFirstInGroup: i === 0,
                            groupSize: groupRows.length,
                          });
                        });
                      });
                      return flat.map(({ row, isFirstInGroup, groupSize }) => (
                        <tr
                          key={row.id}
                          className="border-t border-border hover:bg-muted/40"
                        >
                          {isFirstInGroup ? (
                            <td
                              className="px-4 py-2 align-top border-r border-border/50 bg-muted/20 font-medium"
                              rowSpan={groupSize}
                            >
                              {row.equipment_name}
                            </td>
                          ) : null}
                          <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.chemical_formula}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {row.chemical_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline">
                            {row.category === "major" ? "Major" : "Minor"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">{row.location}</td>
                        <td className="px-4 py-2">
                          {row.created_by_name || "-"}
                        </td>
                        <td className="px-4 py-2">
                          <Badge
                            variant={
                              row.status === "approved"
                                ? "default"
                                : row.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {row.status === "approved"
                              ? "Approved"
                              : row.status === "rejected"
                              ? "Rejected"
                              : "Pending"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 max-w-[280px]">
                          <span className="line-clamp-2 break-words">
                            {row.rejection_comment?.trim() || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canApproveAssignments && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  onClick={() => handleApproveClick(row)}
                                  title="Approve"
                                  disabled={row.status !== "pending"}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRejectClick(row)}
                                  title="Reject"
                                  disabled={row.status !== "pending"}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {isSuperAdmin && (
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 text-rose-600"
                                onClick={() => void handleDelete(row.id)}
                                title="Delete assignment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            {!canApproveAssignments && !isSuperAdmin && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      ));
                    })()
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Approve confirmation */}
      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this assignment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApproveConfirmToComment}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve comment (required) */}
      <Dialog
        open={approveCommentOpen}
        onOpenChange={(open) => {
          if (!open) {
            setApproveCommentOpen(false);
            setApproveComment("");
            setSelectedAssignmentId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Approval Comment (Required)</DialogTitle>
            <DialogDescription>
              Please enter a comment for this approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="approve-comment-assignment">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="approve-comment-assignment"
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Enter approval comment..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setApproveCommentOpen(false);
                  setApproveComment("");
                  setSelectedAssignmentId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => void handleApproveSubmit()}
              >
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation */}
      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this assignment? You will be asked to provide a comment. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={handleRejectConfirmToComment}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject comment (required) */}
      <Dialog
        open={rejectCommentOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRejectCommentOpen(false);
            setRejectComment("");
            setSelectedAssignmentId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rejection Comment (Required)</DialogTitle>
            <DialogDescription>
              Please enter a comment for this rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject-comment-assignment">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="reject-comment-assignment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Enter rejection comment..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectCommentOpen(false);
                  setRejectComment("");
                  setSelectedAssignmentId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleRejectSubmit()}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChemicalAssignmentPage;
