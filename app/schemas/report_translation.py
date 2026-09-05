from pydantic import BaseModel, ConfigDict, Field


class ReportTranslationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=2000, description="Citizen report text to translate")
    source_lang: str = Field(description="Source language code, e.g. 'hi', 'ta', or a raw FLORES-200 tag")
    target_lang: str = Field(description="Target language code, e.g. 'en', 'bn', or a raw FLORES-200 tag")


class ReportTranslationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    translated_text: str = Field(description="Text translated into the requested target language")
    source_lang: str = Field(description="FLORES-200 tag actually used as the source language")
    target_lang: str = Field(description="FLORES-200 tag actually used as the target language")
