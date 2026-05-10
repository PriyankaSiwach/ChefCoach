import { UploadZone } from "./UploadZone";

type Props = {
  currentImage: string | null;
  onImageChange: (img: string | null) => void;
  loading: boolean;
};

export function CameraUploadSection({
  currentImage,
  onImageChange,
  loading,
}: Props) {
  return (
    <section className="pt-5">
      <UploadZone
        currentImage={currentImage}
        onImageChange={onImageChange}
        loading={loading}
      />
    </section>
  );
}
