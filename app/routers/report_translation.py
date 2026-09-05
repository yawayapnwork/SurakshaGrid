import logging

from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.schemas.report_translation import ReportTranslationRequest, ReportTranslationResult
from app.services.model_registry import ModelUnavailableError
from app.services.nllb_translation_service import get_nllb_model, resolve_flores_code, translate_report_text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["report-translation"])


@router.post(
    "/translate-report",
    response_model=ReportTranslationResult,
    status_code=status.HTTP_200_OK,
    summary="Translate a citizen report between Indian regional languages and English",
)
async def translate_report(payload: ReportTranslationRequest) -> ReportTranslationResult:
    """Runs Meta's NLLB-200 locally to translate citizen report text (e.g. Hindi, Bengali,

    Tamil) into English for dispatch operators, or the reverse for operator replies.
    """
    try:
        nllb = await run_in_threadpool(get_nllb_model)
        translated_text = await translate_report_text(nllb, payload.text, payload.source_lang, payload.target_lang)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        logger.error(f"NLLB translation unavailable: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Translation model is temporarily unavailable. Please try again later.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - never leak internals to the client
        logger.exception(f"Unexpected error during report translation: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while translating the report.",
        ) from exc

    return ReportTranslationResult(
        translated_text=translated_text,
        source_lang=resolve_flores_code(payload.source_lang),
        target_lang=resolve_flores_code(payload.target_lang),
    )
