import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PrintOnly } from '@/components/PrintOnly';
import { Button } from '@/components/ui/button';
import { useShiftReport } from './queries';
import { ZReport } from './ZReport';

// Owner: any past shift's Z-report, to review or reprint.
export function ShiftReportPage() {
  const report = useShiftReport(Number(useParams().id));
  return (
    <div className="grid gap-6">
      <Link
        to="/drawer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Cash drawer
      </Link>
      {report.isPending ? (
        <p>Loading…</p>
      ) : report.isError ? (
        <p role="alert" className="text-[15px]">
          {report.error.message}
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr] md:items-start">
          <div className="receipt-outline">
            <ZReport report={report.data} />
          </div>
          <PrintOnly>
            <ZReport report={report.data} />
          </PrintOnly>
          <Button variant="outline" className="sm:max-w-xs" onClick={() => window.print()}>
            <Printer aria-hidden />
            Print
          </Button>
        </div>
      )}
    </div>
  );
}
