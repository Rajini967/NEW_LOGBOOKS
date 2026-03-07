import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Users, Shield, Mail, User, Edit, Trash2, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { userAPI } from '@/lib/api';
import { User as UserType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordRequirementHints } from '@/components/PasswordRequirementHints';

interface UserData extends UserType {
  site?: string;
}

const roleLabels: Record<string, string> = {
  operator: 'Operator',
  supervisor: 'Supervisor',
  client: 'Client',
  customer: 'Client',
  manager: 'Admin',
  super_admin: 'Super Admin',
};

const roleVariants: Record<string, 'default' | 'accent' | 'warning' | 'success'> = {
  operator: 'default',
  supervisor: 'accent',
  client: 'warning',
  customer: 'warning',
  manager: 'accent',
  super_admin: 'success',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    password_confirm: '',
    role: '',
    is_active: true,
  });

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await userAPI.list();
        // Handle paginated response (results) or direct array
        const userList = Array.isArray(response) ? response : (response.results || response);
        setUsers(userList);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        toast.error('Failed to load users');
      }
    };
    fetchUsers();
  }, []);

  const handleEdit = (user: UserData) => {
    setEditingUserId(user.id);
    setIsEditMode(true);
    setFormData({
      email: user.email,
      password: '',
      password_confirm: '',
      role: user.role,
      is_active: user.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password confirmation if password is provided
    if (formData.password && formData.password !== formData.password_confirm) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsLoading(true);

    try {
      if (isEditMode && editingUserId) {
        // Update existing user
        const updateData: any = {
      email: formData.email,
          role: formData.role,
          is_active: formData.is_active,
        };
        
        // Only include password if it's provided
        if (formData.password) {
          if (formData.password.length < 8) {
            toast.error('Password must contain at least 8 characters');
            setIsLoading(false);
            return;
          }
          updateData.password = formData.password;
          updateData.password_confirm = formData.password_confirm;
        }
        
        const updatedUser = await userAPI.update(editingUserId, updateData);
        setUsers(users.map(u => u.id === editingUserId ? updatedUser : u));
        setIsDialogOpen(false);
        setIsEditMode(false);
        setEditingUserId(null);
        setFormData({
          email: '',
          password: '',
          password_confirm: '',
          role: '',
          is_active: true,
        });
        if (formData.password) {
          toast.success('Password changed successfully.');
        } else if (formData.is_active === false) {
          toast.success('User account becomes inactive.');
        } else {
          toast.success('User updated successfully.');
        }
      } else {
        // Create new user
        const newUser = await userAPI.create({
          email: formData.email,
          password: formData.password,
          password_confirm: formData.password_confirm,
          role: formData.role,
          is_active: formData.is_active,
        });

        setUsers([newUser, ...users]);
        setIsDialogOpen(false);
        setFormData({
          email: '',
          password: '',
          password_confirm: '',
          role: '',
          is_active: true,
        });
        toast.success('User created and role assigned successfully.');
      }
    } catch (error: any) {
      console.error('Create user error:', error);
      
      // Handle different error response formats
      let errorMessage = 'Failed to create user';
      
      if (error?.response?.data) {
        const errorData = error.response.data;
        
        // Handle validation errors (field-specific)
        if (errorData.email) {
          const emailErr = Array.isArray(errorData.email) ? errorData.email[0] : errorData.email;
          errorMessage = typeof emailErr === 'string' && (emailErr.includes('already exists') || emailErr.toLowerCase().includes('duplicate'))
            ? 'Duplicate email not allowed.'
            : emailErr;
        } else if (errorData.password) {
          errorMessage = Array.isArray(errorData.password) ? errorData.password[0] : errorData.password;
        } else if (errorData.password_confirm) {
          errorMessage = Array.isArray(errorData.password_confirm) ? errorData.password_confirm[0] : errorData.password_confirm;
        } else if (errorData.role) {
          errorMessage = Array.isArray(errorData.role) ? errorData.role[0] : errorData.role;
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (Object.keys(errorData).length > 0) {
          // Get first error message from any field
          const firstError = Object.values(errorData)[0];
          errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await userAPI.delete(userId);
    setUsers(users.filter(u => u.id !== userId));
      toast.success('User deleted successfully');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.detail || 'Failed to delete user';
      toast.error(errorMessage);
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await userAPI.unlock(userId);
      const response = await userAPI.list();
      const userList = Array.isArray(response) ? response : (response.results || response);
      setUsers(userList);
      toast.success('User unlocked successfully.');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.detail || error?.message || 'Failed to unlock user';
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="User Management"
        subtitle="Manage system users and access control"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="data-label">Total Users</p>
            <p className="reading-display text-2xl">{users.length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Operators</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'operator').length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Supervisors</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'supervisor').length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Clients</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'client' || u.role === 'customer').length}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="success">{users.filter(u => u.is_active).length} Active</Badge>
            <Badge variant="secondary">{users.filter(u => !u.is_active).length} Inactive</Badge>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setIsEditMode(false);
              setEditingUserId(null);
              setFormData({
                email: '',
                password: '',
                password_confirm: '',
                role: '',
                is_active: true,
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {isEditMode ? 'Edit User' : 'Create New User'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {isEditMode 
                    ? 'Update user information. Leave password fields empty to keep the current password.'
                    : "First, enter an email and password. Then, you'll be able to edit more user options."}
                </p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    <Lock className="w-4 h-4 inline mr-2" />
                    Password {!isEditMode && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={isEditMode ? "Leave empty to keep current password" : "Enter password"}
                      required={!isEditMode}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {(!isEditMode || formData.password) && (
                    <PasswordRequirementHints password={formData.password} className="mt-2" compact />
                  )}
                  {isEditMode && !formData.password && (
                    <p className="text-xs text-muted-foreground">
                      Leave empty to keep the current password.
                    </p>
                  )}
                </div>

                {(!isEditMode || formData.password) && (
                  <div className="space-y-2">
                    <Label htmlFor="password_confirm">
                      <Lock className="w-4 h-4 inline mr-2" />
                      Password confirmation {!isEditMode && <span className="text-destructive">*</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password_confirm"
                        type={showPasswordConfirm ? 'text' : 'password'}
                        value={formData.password_confirm}
                        onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                        placeholder="Enter the same password as before, for verification"
                        required={!isEditMode || !!formData.password}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPasswordConfirm((prev) => !prev)}
                        aria-label={showPasswordConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
                      >
                        {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the same password as before, for verification.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="role">
                    <Shield className="w-4 h-4 inline mr-2" />
                    Role <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v })}
                    required
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Super Admin can create Admin, Supervisor, Operator, Client (not Super Admin) */}
                      {currentUser?.role === 'super_admin' && (
                        <>
                          <SelectItem value="manager">Admin</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </>
                      )}
                      {/* Admin (manager) can only create Supervisor, Operator, Client */}
                      {currentUser?.role === 'manager' && (
                        <>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </>
                      )}
                      {/* Fallback: Show limited roles if user role is not set or unknown */}
                      {currentUser?.role !== 'super_admin' && currentUser?.role !== 'manager' && (
                        <>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                      Is active
                  </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Designates whether this user should be treated as active. Unselect this instead of deleting accounts.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent" disabled={isLoading}>
                    {isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update User' : 'Create User')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm">No users found</p>
                      <p className="text-xs mt-1">Users will appear here once created</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-accent">
                            {user.name 
                              ? user.name.split(' ').map(n => n[0]).join('').toUpperCase()
                              : user.email.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.name || user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariants[user.role] || 'default'}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={user.is_active ? 'success' : 'secondary'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {user.is_locked && (
                          <Badge variant="warning">Locked</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {user.is_locked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnlock(user.id)}
                            title="Unlock user"
                          >
                            <LockOpen className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(user.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
    </div>
  );
}
