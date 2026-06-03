import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft, Sparkles, Download, Building2, MapPin, MoreVertical, FileText, FileUp, FileBadge, Play } from 'lucide-react';
import type { ArtifactRecord, ApplicantProfile } from '@jobautomation/core';

import {
  getJob,
  getJobArtifacts,
  generateJobArtifacts,
  buildArtifactFileUrl,
  updateJobReview,
  createApplicationRun
} from '@renderer/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'discovered', label: 'Discovered' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' }
];

function PdfViewerFullscreen({ artifactId }: { artifactId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void buildArtifactFileUrl(artifactId).then(u => {
      if (active) setUrl(u + '#toolbar=0&navpanes=0&view=Fit');
    });
    return () => { active = false; };
  }, [artifactId]);

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center h-full min-h-[400px]">
        <Sparkles className="h-8 w-8 animate-pulse text-primary/50" />
      </div>
    );
  }

  return (
    <iframe
      src={url}
      className="w-full h-[80vh] border-none bg-transparent rounded-lg overflow-hidden"
      title="PDF Viewer Fullscreen"
    />
  );
}

export function JobDetailPage() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Awaited<ReturnType<typeof getJob>>>(null);
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isStartingApplication, setIsStartingApplication] = useState(false);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  
  // Modal Preview State
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactRecord | null>(null);

  const loadData = async () => {
    try {
      const [fetchedJob, artifactsRes] = await Promise.all([
        getJob(jobId),
        getJobArtifacts(jobId)
      ]);
      setJob(fetchedJob);
      setArtifacts(artifactsRes.artifacts);
      setProfile(artifactsRes.profile);
    } catch (error) {
      toast.error('Failed to load job details');
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleGenerate = async (mode: 'both' | 'resume' | 'cover-letter') => {
    setIsGenerating(true);
    setGenerationWarnings([]);
    try {
      const result = await generateJobArtifacts(jobId, { mode });
      const refreshed = await getJobArtifacts(jobId);
      setArtifacts(refreshed.artifacts);
      setProfile(refreshed.profile);
      setGenerationWarnings(result.warnings ?? []);
      if (result.warnings?.length) {
        toast.warning(`Generated with warnings: ${result.warnings.join('; ')}`);
      } else {
        toast.success(`Generated ${mode === 'both' ? 'resume and cover letter' : mode}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedJob = await updateJobReview(jobId, { status: newStatus as any });
      setJob(updatedJob);
      toast.success(`Status updated to ${newStatus}`);
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleStartApplicationRun = async () => {
    setIsStartingApplication(true);
    try {
      const result = await createApplicationRun({ jobId });
      toast.success('Application run started.');
      navigate(`/applications/${result.run.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start application run.');
    } finally {
      setIsStartingApplication(false);
    }
  };

  if (!job) {
    return (
      <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  type UnifiedItem = {
    id: string;
    name: string;
    type: 'Cover Letter' | 'Tailored Resume' | 'Base Resume';
    createdAt: Date;
    updatedAt: Date;
    record: ArtifactRecord | null;
  };

  const items: UnifiedItem[] = [];

  // 2. Generated Artifacts
  artifacts.filter(a => a.format === 'pdf').forEach(a => {
    items.push({
      id: a.id,
      name: a.fileName || `${a.kind}_V${a.version}.pdf`,
      type: a.kind === 'cover-letter' ? 'Cover Letter' : 'Tailored Resume',
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.createdAt),
      record: a
    });
  });

  // Sort: newest first
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const canGenerate = Boolean(profile?.baseResumeTex.trim() && profile.reusableContext.trim());
  const canStartApplicationRun = artifacts.some(
    (artifact) => artifact.kind === 'resume-variant' && artifact.format === 'pdf'
  );

  return (
    <div className="flex flex-col gap-8 h-full min-h-[calc(100vh-10rem)] max-w-7xl mx-auto w-full p-4">
      {/* Header Context Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-muted/20 p-8 rounded-3xl border border-border shadow-sm relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-4 mb-2">
            <Button variant="outline" size="icon" onClick={() => navigate('/jobs')} className="rounded-xl shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-headline text-3xl font-semibold tracking-tight text-foreground">{job.title}</h2>
              <div className="flex items-center gap-4 text-muted-foreground font-medium text-sm mt-1">
                <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {job.companyName}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location || 'Unspecified'}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3">
          <Select value={job.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={!canStartApplicationRun || isStartingApplication}
            onClick={handleStartApplicationRun}
            title={
              canStartApplicationRun
                ? undefined
                : 'Generate a tailored resume PDF before starting an application run.'
            }
            className="w-full sm:w-auto"
          >
            <Play className={`h-4 w-4 mr-2 ${isStartingApplication ? 'animate-pulse' : ''}`} />
            {isStartingApplication ? 'Starting...' : 'Start Application Run'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={isGenerating || !canGenerate} className="bg-primary text-primary-foreground font-semibold shadow-sm w-full sm:w-auto">
                <Sparkles className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-pulse' : ''}`} />
                {isGenerating ? 'Generating...' : 'Generate Artifacts'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleGenerate('both')}>
                <FileBadge className="mr-2 h-4 w-4" /> Both (Cover Letter & Resume)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGenerate('resume')}>
                <FileText className="mr-2 h-4 w-4" /> Tailored Resume Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGenerate('cover-letter')}>
                <FileText className="mr-2 h-4 w-4" /> Cover Letter Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!canGenerate && (
        <div role="alert" className="rounded-lg border border-amber-600/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-300">
          Save a LaTeX base resume and reusable applicant context in Setup before generating artifacts.
        </div>
      )}

      {generationWarnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-600/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-300">
          {generationWarnings.join('; ')}
        </div>
      )}

      {/* Artifact Explorer Table */}
      <div className="flex flex-col gap-6">
        <h3 className="font-headline text-2xl font-semibold text-foreground">Application Artifacts</h3>
        
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="font-semibold text-xs uppercase tracking-widest h-12">Document Name</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest h-12">Created</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest h-12">Last Edited</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest h-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Sparkles className="h-8 w-8 opacity-20" />
                      <p>No artifacts found.</p>
                      <Button variant="outline" size="sm" disabled={!canGenerate || isGenerating} onClick={() => handleGenerate('both')}>Generate Now</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map(item => {
                  const isBase = item.type === 'Base Resume';
                  const Icon = isBase ? FileUp : FileText;
                  
                  return (
                    <TableRow 
                      key={item.id} 
                      className="cursor-pointer group hover:bg-muted/20 transition-colors border-border"
                      onClick={() => {
                        if (item.record) setPreviewArtifact(item.record);
                        else toast.info('Base Resume preview not fully supported here yet.');
                      }}
                    >
                      <TableCell className="py-4 pl-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isBase ? 'bg-secondary/20 text-secondary-foreground' : 'bg-primary/10 text-primary'}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.name}</span>
                            <div className="mt-1 flex gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${
                                item.type === 'Cover Letter' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                item.type === 'Tailored Resume' ? 'bg-primary/10 text-primary' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {item.type}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(item.updatedAt)}
                      </TableCell>
                      <TableCell className="py-4 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1 text-muted-foreground">
                          {item.record && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 hover:text-primary hover:bg-primary/10"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const url = await buildArtifactFileUrl(item.record!.id, true);
                                const a = document.createElement('a');
                                a.href = url;
                                a.target = '_blank';
                                a.click();
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toast.info('Additional options coming soon.'); }}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!previewArtifact} onOpenChange={(open) => !open && setPreviewArtifact(null)}>
        <DialogContent className="max-w-5xl w-full p-6 bg-background/95 backdrop-blur-md border-border">
          {previewArtifact && <PdfViewerFullscreen artifactId={previewArtifact.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
