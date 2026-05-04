import { useState } from "react";
import { useConfirm } from "./ConfirmProvider.jsx";

export default function DeleteButton({
  label = "deletar",
  onConfirm,
  confirmTitle,
  confirmMessage,
  confirmDetail,
}) {
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  const handle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    const ok = await confirm({
      title: confirmTitle || "Confirmar exclusao",
      message: confirmMessage || "Tem certeza?",
      detail: confirmDetail || "Essa acao nao pode ser desfeita.",
      confirmLabel: "Deletar",
      variant: "danger",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="delete-btn"
      onClick={handle}
      disabled={loading}
      title={label}
    >
      ✕
    </button>
  );
}
