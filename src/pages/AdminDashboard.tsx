import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, RotateCcw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface ExtractionStats {
  total: number;
  completed: number;
  failed: number;
  extracting: number;
  pending: number;
}

interface Series {
  _id: string;
  title: string;
  cover: string;
  status: string;
  sourceUrl: string;
  createdAt: string;
  episodeCount?: number;
}

const fetchStats = async (): Promise<ExtractionStats> => {
  const res = await fetch(`${API_BASE}/gallery/extraction/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
};

const fetchSeries = async (): Promise<Series[]> => {
  const res = await fetch(`${API_BASE}/gallery`);
  if (!res.ok) throw new Error("Failed to fetch series");
  const data = await res.json();
  return data.series || [];
};

const resetFailed = async (): Promise<{ reset: number }> => {
  const res = await fetch(`${API_BASE}/gallery/reset-failed`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset");
  return res.json();
};

const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    completed: { variant: "default", icon: <CheckCircle className="w-3 h-3 mr-1" /> },
    failed: { variant: "destructive", icon: <XCircle className="w-3 h-3 mr-1" /> },
    extracting: { variant: "secondary", icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    pending: { variant: "outline", icon: <Clock className="w-3 h-3 mr-1" /> },
  };
  
  const { variant, icon } = variants[status] || variants.pending;
  
  return (
    <Badge variant={variant} className="flex items-center w-fit">
      {icon}
      {status}
    </Badge>
  );
};

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["extraction-stats"],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  const { data: series = [], isLoading: seriesLoading, refetch: refetchSeries } = useQuery({
    queryKey: ["admin-series"],
    queryFn: fetchSeries,
    refetchInterval: 30000,
  });

  const resetMutation = useMutation({
    mutationFn: resetFailed,
    onSuccess: (data) => {
      toast({ title: "Reset Complete", description: `${data.reset} series queued for re-extraction` });
      queryClient.invalidateQueries({ queryKey: ["extraction-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset failed series", variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchSeries();
    toast({ title: "Refreshed", description: "Data updated" });
  };

  const progressPercent = stats ? (stats.completed / stats.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Extraction Dashboard</h1>
            <p className="text-muted-foreground">Monitor and manage series extraction</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={statsLoading || seriesLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || !stats?.failed}
            >
              <RotateCcw className={`w-4 h-4 mr-2 ${resetMutation.isPending ? "animate-spin" : ""}`} />
              Reset Failed ({stats?.failed || 0})
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-2xl">{stats?.total || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-500/50">
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl text-green-500">{stats?.completed || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-500/50">
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-2xl text-red-500">{stats?.failed || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-yellow-500/50">
            <CardHeader className="pb-2">
              <CardDescription>Extracting</CardDescription>
              <CardTitle className="text-2xl text-yellow-500">{stats?.extracting || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">{stats?.pending || 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Overall Progress</CardTitle>
            <CardDescription>{progressPercent.toFixed(1)}% complete</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progressPercent} className="h-3" />
          </CardContent>
        </Card>

        {/* Series Table */}
        <Card>
          <CardHeader>
            <CardTitle>Series List</CardTitle>
            <CardDescription>All tracked series and their extraction status</CardDescription>
          </CardHeader>
          <CardContent>
            {seriesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : series.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No series found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cover</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Episodes</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((s) => (
                    <TableRow key={s._id}>
                      <TableCell>
                        <img 
                          src={s.cover || "/placeholder.svg"} 
                          alt={s.title} 
                          className="w-12 h-16 object-cover rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>{s.episodeCount || 0}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
