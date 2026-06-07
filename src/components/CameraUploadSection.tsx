import { UploadZone } from "./UploadZone";

type Props = {
  currentImage: string | null;
  onImageChange: (img: string | null) => void;
  loading: boolean;
  loadingMessage?: string;
};

export function CameraUploadSection({
  currentImage,
  onImageChange,
  loading,
  loadingMessage,
}: Props) {
  return (
    <section className="app-shell px-4 pt-4 pb-2">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">
            Step 1
          </p>
          <h2 className="font-playfair text-xl text-[var(--green)]">Scan your fridge</h2>
        </div>
        <p className="pb-0.5 text-[11px] text-[var(--gray)]">Photo → recipes</p>
      </div>
      <UploadZone
        currentImage={currentImage}
        onImageChange={onImageChange}
        loading={loading}
        loadingMessage={loadingMessage}
      />
    </section>
  );
}
