interface DownloadButtonProps {
  onDownload: () => void;
  disabled?: boolean;
}

export function DownloadButton({ onDownload, disabled = false }: DownloadButtonProps) {
  return (
    <button 
      onClick={onDownload}
      disabled={disabled}
      className="flex items-center justify-center px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
      title="Download Image"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="ml-2">Download</span>
    </button>
  );
}