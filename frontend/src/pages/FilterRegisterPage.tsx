import React, { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  filterCategoryAPI,
  filterMasterAPI,
  filterAssignmentAPI,
  filterScheduleAPI,
  equipmentAPI,
  equipmentCategoryAPI,
} from "@/lib/api";
import { Loader2, Plus, CheckCircle2, XCircle, Link2, ArrowLeft, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
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
import { useAuth } from "@/contexts/AuthContext";

interface FilterCategory {
  id: string;
  name: string;
  is_active: boolean;
}

interface FilterMaster {
  id: string;
  filter_id: string;
  category: string;
  category_name: string;
  make: string;
  model: string;
  serial_number?: string | null;
  size_l?: number | null;
  size_w?: number | null;
  size_h?: number | null;
  micron_size: string;
  status: "draft" | "pending" | "approved" | "rejected" | "inactive";
  created_by?: string | null;
}

interface EquipmentOption {
  id: string;
  equipment_number: string;
  name: string;
  site_id?: string | null;
  capacity?: string | null;
}

const MICRON_OPTIONS = ["0.2", "0.45", "1", "3", "5", "10", "20", "100"];

const FilterRegisterPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [filters, setFilters] = useState<FilterMaster[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    category: "",
    make: "",
    model: "",
    serial_number: "",
    size_l: "",
    size_w: "",
    size_h: "",
    micron_size: "",
    certificate_file: null as File | null,
    notes: "",
  });
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assignForFilter, setAssignForFilter] = useState<FilterMaster | null>(
    null
  );
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>(
    []
  );
  const [assignForm, setAssignForm] = useState({
    equipment: "",
    area_category: "",
    tag_info: "",
    replacement_frequency_days: "",
    cleaning_frequency_days: "",
    integrity_frequency_days: "",
  });
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);
  const [pendingApprovalFilter, setPendingApprovalFilter] =
    useState<FilterMaster | null>(null);
  const [pendingRejectFilter, setPendingRejectFilter] =
    useState<FilterMaster | null>(null);
  const [pendingDeleteFilter, setPendingDeleteFilter] =
    useState<FilterMaster | null>(null);

  const loadCategories = async () => {
    try {
      const data = await filterCategoryAPI.list();
      setCategories(data.filter((c: FilterCategory) => c.is_active));
    } catch (error: any) {
      toast({
        title: "Failed to load categories",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const loadFilters = async () => {
    setIsLoading(true);
    try {
      const data = await filterMasterAPI.list();
      setFilters(data);
    } catch (error: any) {
      toast({
        title: "Failed to load filter register",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEquipment = async () => {
    try {
      // Fetch equipment from equipment list, excluding chillers (Chiller / Chillers category).
      const categories = (await equipmentCategoryAPI.list()) as {
        id: string;
        name: string;
      }[];
      const chillerCategoryIds = new Set(
        categories
          .filter((c) => /^chiller(s)?$/i.test((c.name || "").trim()))
          .map((c) => c.id)
      );

      const list = (await equipmentAPI.list({
        status: "approved",
      })) as any[];

      const options = (list || [])
        .filter(
          (item: any) =>
            item?.is_active !== false &&
            item?.status === "approved" &&
            !chillerCategoryIds.has(item?.category)
        )
        .map((item: any) => ({
          id: item.id,
          equipment_number: item.equipment_number,
          name: item.name,
          site_id: item.site_id ?? null,
          capacity: item.capacity ?? null,
        }));

      setEquipmentOptions(options);
    } catch (error: any) {
      toast({
        title: "Failed to load equipment",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setEquipmentOptions([]);
    }
  };

  const applyEquipmentAutomationDetails = (equipmentId: string) => {
    const eq = equipmentOptions.find((e) => e.id === equipmentId);
    if (!eq) return;
    const parts = [
      `${eq.equipment_number} – ${eq.name}`,
      eq.site_id ? `Site: ${eq.site_id}` : null,
      eq.capacity ? `Capacity: ${eq.capacity}` : null,
    ].filter(Boolean);
    const autoTag = parts.join(" | ");
    setAssignForm((prev) => ({
      ...prev,
      equipment: equipmentId,
      tag_info: prev.tag_info?.trim() ? prev.tag_info : autoTag,
    }));
  };

  useEffect(() => {
    void loadCategories();
    void loadFilters();
  }, []);

  const handleRegisterInputChange = (
    field: keyof typeof registerForm,
    value: any
  ) => {
    setRegisterForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.category || !registerForm.make || !registerForm.model) {
      toast({
        title: "Please fill required fields",
        description: "Category, make and model are required.",
        variant: "destructive",
      });
      return;
    }
    if (!registerForm.micron_size) {
      toast({
        title: "Micron size is required",
        variant: "destructive",
      });
      return;
    }

    setIsRegisterSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("category", registerForm.category);
      formData.append("make", registerForm.make);
      formData.append("model", registerForm.model);
      if (registerForm.serial_number) {
        formData.append("serial_number", registerForm.serial_number);
      }
      if (registerForm.size_l) {
        formData.append("size_l", registerForm.size_l);
      }
      if (registerForm.size_w) {
        formData.append("size_w", registerForm.size_w);
      }
      if (registerForm.size_h) {
        formData.append("size_h", registerForm.size_h);
      }
      formData.append("micron_size", registerForm.micron_size);
      if (registerForm.certificate_file) {
        formData.append("certificate_file", registerForm.certificate_file);
      }

      await filterMasterAPI.create(formData);
      toast({
        title: "Filter registered",
        description: "The filter has been created in pending status.",
      });
      setIsRegisterDialogOpen(false);
      setRegisterForm({
        category: "",
        make: "",
        model: "",
        serial_number: "",
        size_l: "",
        size_w: "",
        size_h: "",
        micron_size: "",
        certificate_file: null,
        notes: "",
      });
      await loadFilters();
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description:
          error?.message ||
          "Please check the form values and try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  const handleApprove = async (filter: FilterMaster) => {
    try {
      await filterMasterAPI.approve(filter.id);
      toast({
        title: "Filter approved",
      });
      await loadFilters();
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (filter: FilterMaster) => {
    try {
      await filterMasterAPI.reject(filter.id);
      toast({
        title: "Filter rejected",
      });
      await loadFilters();
    } catch (error: any) {
      toast({
        title: "Rejection failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (filter: FilterMaster) => {
    try {
      await filterMasterAPI.delete(filter.id);
      toast({
        title: "Filter deleted",
      });
      await loadFilters();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const openAssignDialog = async (filter: FilterMaster) => {
    setAssignForFilter(filter);
    setAssignForm({
      equipment: "",
      area_category: "",
      tag_info: "",
      replacement_frequency_days: "",
      cleaning_frequency_days: "",
      integrity_frequency_days: "",
    });
    setIsAssignDialogOpen(true);
    await loadEquipment();
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForFilter) return;
    if (!assignForm.equipment) {
      toast({
        title: "Equipment is required",
        variant: "destructive",
      });
      return;
    }

    setIsAssignSubmitting(true);
    try {
      const assignment = await filterAssignmentAPI.create({
        filter: assignForFilter.id,
        equipment: assignForm.equipment,
        area_category: assignForm.area_category || undefined,
        tag_info: assignForm.tag_info || undefined,
      });

      const schedulePromises: Promise<any>[] = [];
      if (assignForm.replacement_frequency_days) {
        schedulePromises.push(
          filterScheduleAPI.create({
            assignment: assignment.id,
            schedule_type: "replacement",
            frequency_days: Number(assignForm.replacement_frequency_days),
          })
        );
      }
      if (assignForm.cleaning_frequency_days) {
        schedulePromises.push(
          filterScheduleAPI.create({
            assignment: assignment.id,
            schedule_type: "cleaning",
            frequency_days: Number(assignForm.cleaning_frequency_days),
          })
        );
      }
      if (assignForm.integrity_frequency_days) {
        schedulePromises.push(
          filterScheduleAPI.create({
            assignment: assignment.id,
            schedule_type: "integrity",
            frequency_days: Number(assignForm.integrity_frequency_days),
          })
        );
      }
      if (schedulePromises.length > 0) {
        await Promise.all(schedulePromises);
      }

      toast({
        title: "Filter assigned",
        description:
          schedulePromises.length > 0
            ? "Assignment saved. Maintenance schedules are pending approval."
            : "Assignment saved.",
      });
      setIsAssignDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Assignment failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const micronLabel = useMemo(
    () => (value: string) => `${value} µ`,
    []
  );

  return (
    <div className="min-h-screen">
      <Header
        title="Filter Register"
        subtitle="Register filters, manage approval workflow, and assign filters to equipment with basic schedules."
      />

      <div className="px-6 pt-2">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/filter/settings")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>

      <main className="p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Registered Filters
            </h2>
            <Button onClick={() => setIsRegisterDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Filter
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Filter ID
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Make / Model
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Serial No.
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Size (L×W×H)
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Micron
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
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
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading filters...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filters.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No filters registered yet. Click &quot;New Filter&quot;
                        to get started.
                      </td>
                    </tr>
                  ) : (
                    filters.map((filter) => (
                      <tr
                        key={filter.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">
                          {filter.filter_id || "—"}
                        </td>
                        <td className="px-4 py-2">
                          {filter.category_name || "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span>{filter.make}</span>
                            <span className="text-xs text-muted-foreground">
                              {filter.model}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {filter.serial_number || "—"}
                        </td>
                        <td className="px-4 py-2">
                          {filter.size_l && filter.size_w && filter.size_h
                            ? `${filter.size_l} × ${filter.size_w} × ${filter.size_h}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {micronLabel(filter.micron_size)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              filter.status === "approved"
                                ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : filter.status === "pending"
                                ? "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                                : filter.status === "rejected"
                                ? "inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                                : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                            }
                          >
                            {filter.status.charAt(0).toUpperCase() +
                              filter.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            {filter.status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-emerald-600"
                                  onClick={() => {
                                    const currentUserId = user?.id
                                      ? String(user.id)
                                      : "";
                                    const createdById = filter.created_by
                                      ? String(filter.created_by)
                                      : "";

                                    if (
                                      createdById &&
                                      currentUserId &&
                                      createdById === currentUserId
                                    ) {
                                      toast({
                                        title:
                                          "Cannot approve your own registered filter",
                                        description:
                                          "Filter Register Done By and Approved By users must be different.",
                                        variant: "destructive",
                                      });
                                      return;
                                    }

                                    setPendingApprovalFilter(filter);
                                  }}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-rose-600"
                                  onClick={() => setPendingRejectFilter(filter)}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {filter.status !== "approved" && user?.role === "super_admin" && (
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setPendingDeleteFilter(filter)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            {filter.status === "approved" && (
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => openAssignDialog(filter)}
                              >
                                <Link2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <Dialog
        open={isRegisterDialogOpen}
        onOpenChange={(open) => {
          setIsRegisterDialogOpen(open);
          if (!open) {
            setRegisterForm({
              category: "",
              make: "",
              model: "",
              serial_number: "",
              size_l: "",
              size_w: "",
              size_h: "",
              micron_size: "",
              certificate_file: null,
              notes: "",
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleRegisterSubmit}>
            <DialogHeader>
              <DialogTitle>Register New Filter</DialogTitle>
              <DialogDescription>
                Enter the filter details. New filters will be created in
                pending status and require approval.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Category<span className="text-destructive">*</span>
                </label>
                <Select
                  value={registerForm.category}
                  onValueChange={(value) =>
                    handleRegisterInputChange("category", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-48 overflow-y-auto">
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Make<span className="text-destructive">*</span>
                </label>
                <Input
                  value={registerForm.make}
                  onChange={(e) =>
                    handleRegisterInputChange("make", e.target.value)
                  }
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Model<span className="text-destructive">*</span>
                </label>
                <Input
                  value={registerForm.model}
                  onChange={(e) =>
                    handleRegisterInputChange("model", e.target.value)
                  }
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Serial Number
                </label>
                <Input
                  value={registerForm.serial_number}
                  onChange={(e) =>
                    handleRegisterInputChange("serial_number", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Size L (mm)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={registerForm.size_l}
                  onChange={(e) =>
                    handleRegisterInputChange("size_l", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Size W (mm)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={registerForm.size_w}
                  onChange={(e) =>
                    handleRegisterInputChange("size_w", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Size H (mm)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={registerForm.size_h}
                  onChange={(e) =>
                    handleRegisterInputChange("size_h", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Micron Size<span className="text-destructive">*</span>
                </label>
                <Select
                  value={registerForm.micron_size}
                  onValueChange={(value) =>
                    handleRegisterInputChange("micron_size", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select micron size" />
                  </SelectTrigger>
                  <SelectContent className="max-h-32 overflow-y-auto">
                    {MICRON_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {micronLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Certificate (PDF/JPG)
                </label>
                <Input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleRegisterInputChange("certificate_file", file);
                  }}
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Notes
                </label>
                <Textarea
                  value={registerForm.notes}
                  onChange={(e) =>
                    handleRegisterInputChange("notes", e.target.value)
                  }
                  placeholder="Optional notes about this filter"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRegisterDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRegisterSubmitting}>
                {isRegisterSubmitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Register Filter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAssignDialogOpen}
        onOpenChange={(open) => {
          setIsAssignDialogOpen(open);
          if (!open) {
            setAssignForFilter(null);
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleAssignSubmit}>
            <DialogHeader>
              <DialogTitle>Assign Filter to Equipment</DialogTitle>
              <DialogDescription>
                Assign the approved filter to equipment and configure basic
                schedules.
              </DialogDescription>
            </DialogHeader>

            {assignForFilter && (
              <div className="mt-2 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  {assignForFilter.filter_id || "Unassigned ID"} –{" "}
                  {assignForFilter.make} {assignForFilter.model}
                </div>
                <div>
                  Category: {assignForFilter.category_name || "—"}, Micron:{" "}
                  {micronLabel(assignForFilter.micron_size)}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Equipment<span className="text-destructive">*</span>
                </label>
                <Select
                  value={assignForm.equipment}
                  onValueChange={(value) => applyEquipmentAutomationDetails(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentOptions.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.equipment_number} – {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Area Category
                </label>
                <Select
                  value={assignForm.area_category}
                  onValueChange={(value) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      area_category: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select area category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Production">Production</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="AHU Room">AHU Room</SelectItem>
                    <SelectItem value="Warehouse">Warehouse</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Tag Information
                </label>
                <Input
                  value={assignForm.tag_info}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      tag_info: e.target.value,
                    }))
                  }
                  placeholder="Optional tag or location details"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Replacement Frequency (days)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={assignForm.replacement_frequency_days}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      replacement_frequency_days: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Cleaning Frequency (days)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={assignForm.cleaning_frequency_days}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      cleaning_frequency_days: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Integrity Test Frequency (days)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={assignForm.integrity_frequency_days}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      integrity_frequency_days: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isAssignSubmitting}>
                {isAssignSubmitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Assignment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingApprovalFilter}
        onOpenChange={(open) => {
          if (!open) setPendingApprovalFilter(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve filter?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingApprovalFilter
                ? `Approve filter ${pendingApprovalFilter.make} ${pendingApprovalFilter.model}? It will become available for assignment.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setPendingApprovalFilter(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingApprovalFilter) return;
                const target = pendingApprovalFilter;
                setPendingApprovalFilter(null);
                await handleApprove(target);
              }}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingRejectFilter}
        onOpenChange={(open) => {
          if (!open) setPendingRejectFilter(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject filter?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRejectFilter
                ? `Reject filter ${pendingRejectFilter.make} ${pendingRejectFilter.model}? This action will mark it as rejected.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRejectFilter(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingRejectFilter) return;
                const target = pendingRejectFilter;
                setPendingRejectFilter(null);
                await handleReject(target);
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingDeleteFilter}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteFilter(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete filter?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteFilter
                ? `Delete filter ${pendingDeleteFilter.make} ${pendingDeleteFilter.model}? You can only delete filters before they are approved.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteFilter(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDeleteFilter) return;
                const target = pendingDeleteFilter;
                setPendingDeleteFilter(null);
                await handleDelete(target);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FilterRegisterPage;

