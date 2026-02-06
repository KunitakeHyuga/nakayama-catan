from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Tuple

try:
    from openai import OpenAI, OpenAIError
except ImportError as exc:  # pragma: no cover - happens when optional dep missing
    OpenAI = None  # type: ignore[assignment]
    OpenAIError = Exception  # type: ignore[assignment]
    _OPENAI_IMPORT_ERROR = exc
else:
    _OPENAI_IMPORT_ERROR = None

from catanatron.game import Game
from catanatron.json import GameEncoder
from catanatron.models.enums import DEVELOPMENT_CARDS, RESOURCES


class NegotiationAdviceError(Exception):
    """Base error for negotiation advice endpoint."""


class NegotiationAdviceUnavailableError(NegotiationAdviceError):
    """Raised when the OpenAI client cannot be initialized."""


_openai_client: OpenAI | None = None


def _get_openai_client() -> OpenAI:
    global _openai_client
    if OpenAI is None:
        raise NegotiationAdviceUnavailableError(
            "openai package is not installed. "
            "Install catanatron with the 'web' extra or `pip install openai>=1.6.0`."
        ) from _OPENAI_IMPORT_ERROR

    if _openai_client is not None:
        return _openai_client

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise NegotiationAdviceUnavailableError(
            "OPENAI_API_KEY is not configured on the server."
        )

    _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _to_pretty_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _summarize_player_state(game_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    player_state = game_payload.get("player_state", {})
    summaries: List[Dict[str, Any]] = []
    for index, color in enumerate(game_payload.get("colors", [])):
        prefix = f"P{index}_"
        resources = {
            resource: player_state.get(f"{prefix}{resource}_IN_HAND", 0)
            for resource in RESOURCES
        }
        dev_cards = {
            card: player_state.get(f"{prefix}{card}_IN_HAND", 0)
            for card in DEVELOPMENT_CARDS
        }
        summaries.append(
            {
                "color": color,
                "victory_points": player_state.get(f"{prefix}VICTORY_POINTS"),
                "actual_victory_points": player_state.get(
                    f"{prefix}ACTUAL_VICTORY_POINTS"
                ),
                "resources_in_hand": resources,
                "development_cards_in_hand": dev_cards,
                "has_longest_road": player_state.get(f"{prefix}HAS_ROAD"),
                "has_largest_army": player_state.get(f"{prefix}HAS_ARMY"),
                "knights_played": player_state.get(f"{prefix}PLAYED_KNIGHT"),
                "monopoly_played": player_state.get(f"{prefix}PLAYED_MONOPOLY"),
                "year_of_plenty_played": player_state.get(
                    f"{prefix}PLAYED_YEAR_OF_PLENTY"
                ),
                "road_building_played": player_state.get(
                    f"{prefix}PLAYED_ROAD_BUILDING"
                ),
            }
        )
    return summaries


def _summarize_board(game_payload: Dict[str, Any]) -> Dict[str, Any]:
    nodes = game_payload.get("nodes", {})
    if isinstance(nodes, dict):
        node_values = list(nodes.values())
    else:
        node_values = nodes
    built_structures = [
        {
            "node_id": node.get("id"),
            "color": node.get("color"),
            "building": node.get("building"),
            "tile_coordinate": node.get("tile_coordinate"),
        }
        for node in node_values
        if node.get("color")
    ]
    claimed_roads = [
        {"edge_id": edge.get("id"), "color": edge.get("color")}
        for edge in game_payload.get("edges", [])
        if edge.get("color")
    ]
    return {
        "tiles": game_payload.get("tiles"),
        "robber_coordinate": game_payload.get("robber_coordinate"),
        "built_structures": built_structures,
        "claimed_roads": claimed_roads,
    }


def _summarize_actions(
    action_records: List[list], max_items: int
) -> Tuple[List[Dict[str, Any]], int]:
    trimmed = action_records[-max_items:] if max_items else action_records
    starting_index = len(action_records) - len(trimmed)
    formatted: List[Dict[str, Any]] = []
    for idx, record in enumerate(trimmed):
        if not isinstance(record, list) or len(record) != 2:
            continue
        action, result = record
        formatted.append(
            {
                "sequence": starting_index + idx + 1,
                "color": action[0] if action else None,
                "action": action[1] if action else None,
                "value": action[2] if action else None,
                "result": result,
            }
        )
    return formatted, starting_index


def _map_player_color(color: str) -> str:
    color_map = {
        "RED": "赤",
        "BLUE": "青",
        "WHITE": "白",
        "ORANGE": "オレンジ",
    }
    return color_map.get(color, color)


def _build_strategy_section(
    player_colors: List[str], requester_color: str | None = None
) -> List[str]:
    if not player_colors:
        return []
    filtered_colors = [color for color in player_colors if color != requester_color]
    if not filtered_colors:
        return []
    lines: List[str] = ["他プレイヤーの戦略分析："]
    for color in filtered_colors:
        label = _map_player_color(color)
        lines.extend(
            [
                f" {label}",
                "  戦略分類：開拓地特化型か都市特化型かカード特化型",
                "  分析：",
            ]
        )
    lines.append("")
    return lines


def _build_prompt(
    game: Game, requester_color: str | None = None
) -> Tuple[str, Dict[str, Any]]:
    payload = json.loads(json.dumps(game, cls=GameEncoder))
    player_summaries = _summarize_player_state(payload)
    board_snapshot = _summarize_board(payload)
    max_actions = int(os.environ.get("NEGOTIATION_LOG_LIMIT", "32"))
    formatted_actions, action_offset = _summarize_actions(
        payload.get("action_records", []),
        max_actions,
    )

    playable_actions = payload.get("current_playable_actions", [])
    human_colors = sorted(
        list(set(payload.get("colors", [])) - set(payload.get("bot_colors", [])))
    )
    effective_current_color = requester_color or payload.get("current_color")
    context = {
        "player_summaries": player_summaries,
        "board_snapshot": board_snapshot,
        "recent_action_log": formatted_actions,
        "action_offset": action_offset,
        "current_color": effective_current_color,
        "human_colors": human_colors,
        "playable_actions": playable_actions,
        "longest_roads_by_player": payload.get("longest_roads_by_player"),
        "player_colors": payload.get("colors", []),
    }

    prompt = "\n".join(
        [
            "## ゲーム状況",
            f"現在の手番: {effective_current_color}",
            f"人間プレイヤー: {', '.join(human_colors) if human_colors else '（全員ボット）'}",
            "### プレイヤー情報",
            _to_pretty_json(player_summaries),
            "### 最近の行動ログ",
            _to_pretty_json(formatted_actions),
        ]
    )

    return prompt, context


def generate_negotiation_advice(
    game: Game,
    board_image_data_url: str | None = None,
    requester_color: str | None = None,
) -> Tuple[str, Dict[str, Any]]:
    client = _get_openai_client()
    prompt, context = _build_prompt(game, requester_color)
    fallback_model = os.environ.get("NEGOTIATION_ADVICE_FALLBACK_MODEL", "gpt-5-mini")
    preferred_model = os.environ.get("NEGOTIATION_ADVICE_MODEL") or os.environ.get(
        "OPENAI_MODEL"
    )
    model = preferred_model or "gpt-5o-mini"
    temperature_value = os.environ.get("NEGOTIATION_ADVICE_TEMPERATURE", "").strip()
    temperature: float | None
    if temperature_value:
        try:
            temperature = float(temperature_value)
        except ValueError:
            temperature = None
    else:
        temperature = None
    player_colors = context.get("player_colors") or []
    requester_id = context.get("current_color")
    strategy_section = _build_strategy_section(player_colors, requester_id)
    instructions = "\n".join(
        [
            "あなたはカタンの交渉支援AIエージェントです。プレイヤー情報および盤面情報を参照して初心者プレイヤーの交渉の手助けをしてください。以下のテンプレートを厳守し、日本語で回答してください。",
            "テンプレート以外の文章は追加しないこと。",
            "プレイヤー色は必ず「赤」「青」「白」「オレンジ」の表記を使い、資源名は「木材」「レンガ」「羊毛」「小麦」「鉱石」で統一してください。",
            "枚数は「2枚」ではなく「×2」表記を使ってください。",
            "括弧（）や()は一切使わないでください。",
            "各項目は1行または2文以内，40文字程度で済ませ冗長な言い回しや決まり文句を入れないこと。",
            "説明文には必ず具体的な資源名や建設予定の地点，必要枚数などの事実を盛り込むこと。",
            "手札に存在しない資源は譲る資源にもNG資源にも記載しないこと。NG欄には現在手札にある資源のうち交渉で絶対に出さないものだけを書くこと。",
            "戦略分析はアドバイスを求めているプレイヤーを除いた他プレイヤーのみを対象とすること。",
            "戦略分類は次を参考にする。",
            "開拓地特化型は街道(木材やレンガ)と開拓地(羊毛や小麦)を広げて安定資源を狙う。",
            "都市特化型は開拓地を都市化(小麦や鉱石)して資源量を伸ばし交渉で不足資源を補う。",
            "カード特化型は発展カード重視(羊毛，小麦，鉱石)で高リスク高リターンな戦略である。",
            "交渉は勝利点が最多の相手をできるだけ避ける。",
            "交渉相手は参加しているプレイヤーの色のみ挙げること。",
            "アドバイス対象は常に都市特化型で行動し都市化や鉱石/小麦確保を最優先するよう具体的に指示すること。",
            "都市化が詰まった場合のみ代替プラン(街道建設や開拓地建設または発展カード)を提示し必ず都市化へ戻す条件を書くこと。",
            "「重視する」「確保する」など曖昧な語を使わず、目的と行動を明示する文(例: 港ダブル取得を狙い木材港へ延伸)にすること。",
            "必ず「港名」「開拓地特化/都市特化/カード特化」「発展カード名」など公式用語を用い、行動手順や狙いを具体的に書くこと。",
            "港を勧める際は現状の街道網から最短何本で到達できるか、既に他色が建設済みでないかを確認し、到達不可なら理由と別案を提示すること。",
            "到達ルートや必要資源を見積もれない場合は「港奪取不可」と明示し、現実的な都市化手順に切り替えること。",
            "今は(交渉する/交渉しない)。",
            "理由：(2行で簡潔に)。",
            "",
            " 分析は，相手の戦略を考慮して，どんな資源を求めそうか，どんな行動を取りそうかを含めること。",
            " どの方向に建設するか，港を取るか，特殊ポイントを取るべきかも入れて",
            *strategy_section,
            "おすすめの交渉",
            "----------------------------",
            "① 相手：(Px)    譲：(資源)⇌受：(資源)",
            "",
            "    相手の得：(1行)",
            "    自分の得：(1行)",
            "    注意：(1行)",
            "    成功率見込み：(xx%)",
            "",
            "   譲る許容範囲",
            "    上限：(出してよい最大)",
            "    NG：(絶対出さないもの)",
            "----------------------------",
            "② 相手：(Py)    譲：(資源)⇌受：(資源)",
            "",
            "    相手の得：(1行)",
            "    自分の得：(1行)",
            "    注意：(1行)",
            "    成功率見込み：(xx%)",
            "",
            "   譲る許容範囲",
            "    上限：(出してよい最大)",
            "    NG：(絶対出さないもの)",
            "----------------------------",
        ]
    )
    prompt_with_instructions = f"{prompt}\n\n{instructions}"
    human_colors = context.get("human_colors") or []
    playable_actions = context.get("playable_actions") or []
    logging.info(
        "Negotiation prompt ready: model=%s temp=%s board_image=%s prompt_chars=%d humans=%s playable_actions=%d",
        model,
        temperature if temperature is not None else "default",
        bool(board_image_data_url),
        len(prompt_with_instructions),
        ",".join(human_colors) if human_colors else "(none)",
        len(playable_actions),
    )
    if board_image_data_url:
        image_suffix = (
            "プレイヤー情報および盤面情報を参照して初心者プレイヤーの交渉の手助けをしてください。"
        )
        prompt_with_instructions = f"{prompt_with_instructions}\n\n{image_suffix}"
    if board_image_data_url:
        user_content: Any = [
            {"type": "text", "text": prompt_with_instructions},
            {
                "type": "image_url",
                "image_url": {"url": board_image_data_url, "detail": "low"},
            },
        ]
    else:
        user_content = prompt_with_instructions

    try:
        request_kwargs: Dict[str, Any] = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "あなたはカタンの交渉支援AIエージェントです。プレイヤー情報および盤面情報を参照して初心者プレイヤーの交渉の手助けをしてください。以下のテンプレートを厳守し、日本語で回答してください。",
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
        }
        if temperature is not None:
            request_kwargs["temperature"] = temperature
        logging.info(
            "Negotiation advice request -> model=%s temp=%s board_image=%s",
            request_kwargs.get("model"),
            request_kwargs.get("temperature", "default"),
            bool(board_image_data_url),
        )
        logging.info("Negotiation advice prompt:\n%s", prompt_with_instructions)
        def _execute_request() -> Any:
            return client.chat.completions.create(**request_kwargs)

        try:
            response = _execute_request()
        except OpenAIError as exc:
            error_code = getattr(exc, "code", None)
            error_message = str(exc).lower()
            model_missing = (error_code == "model_not_found") or (
                "model_not_found" in error_message
                or "does not exist" in error_message
                or "do not have access" in error_message
            )
            if temperature is not None and error_code == "unsupported_value":
                logging.warning(
                    "Negotiation advice temperature unsupported (temp=%s). Retrying without it.",
                    temperature,
                )
                request_kwargs.pop("temperature", None)
                response = _execute_request()
            elif model_missing and request_kwargs.get("model") not in (
                fallback_model,
                None,
            ):
                logging.warning(
                    "Negotiation advice model '%s' not found. Falling back to '%s'.",
                    request_kwargs.get("model"),
                    fallback_model,
                )
                request_kwargs["model"] = fallback_model
                response = _execute_request()
            else:
                raise
    except OpenAIError as exc:
        logging.exception("Negotiation advice OpenAI error: %s", exc)
        raise NegotiationAdviceError(str(exc)) from exc

    choices = getattr(response, "choices", [])
    usage = getattr(response, "usage", None)
    finish_reason = choices[0].finish_reason if choices else None
    logging.info(
        "Negotiation advice response <- choices=%d finish=%s usage=%s",
        len(choices),
        finish_reason,
        usage,
    )
    if not choices:
        raise NegotiationAdviceError("OpenAI API response did not include any choices.")

    advice = choices[0].message.content if choices[0].message else None
    if not advice:
        raise NegotiationAdviceError("OpenAI API response did not include text content.")

    return advice.strip(), context


def generate_negotiation_followup(
    game: Game,
    question: str,
    advice: str | None = None,
    history: List[Dict[str, str]] | None = None,
    board_image_data_url: str | None = None,
    requester_color: str | None = None,
) -> Tuple[str, Dict[str, Any]]:
    client = _get_openai_client()
    prompt, context = _build_prompt(game, requester_color)
    fallback_model = os.environ.get("NEGOTIATION_ADVICE_FALLBACK_MODEL", "gpt-4o-mini")
    preferred_model = os.environ.get("NEGOTIATION_ADVICE_MODEL") or os.environ.get(
        "OPENAI_MODEL"
    )
    model = preferred_model or "gpt-5o-mini"
    temperature_value = os.environ.get("NEGOTIATION_ADVICE_TEMPERATURE", "").strip()
    temperature: float | None
    if temperature_value:
        try:
            temperature = float(temperature_value)
        except ValueError:
            temperature = None
    else:
        temperature = None
    history_lines: List[str] = []
    for entry in history or []:
        q = (entry.get("question") or "").strip()
        a = (entry.get("answer") or "").strip()
        if not q and not a:
            continue
        if q:
            history_lines.append(f"Q: {q}")
        if a:
            history_lines.append(f"A: {a}")
    instructions = "\n".join(
        [
            "あなたはカタンの交渉支援AIエージェントです。日本語で簡潔に回答してください。",
            "プレイヤー色は必ず「赤」「青」「白」「橙」の表記を使い、資源名は「木材」「レンガ」「羊毛」「小麦」「鉱石」で統一してください。",
            "枚数は「2枚」ではなく「×2」表記を使ってください。",
            "括弧（）や()は一切使わないでください。",
            "各回答は1行または2文以内で40文字程度に抑え，具体的な資源名や必要数を必ず示してください。",
            "依頼者は常に都市特化方針なので都市化を最優先に、詰まる場合だけ代替策と復帰条件を指示してください。",
            "「重視する」「確保する」など曖昧な語は禁止し、例として「鉱石港取得のため北東へ街道建設×2」等の行動＋目的で記述してください。",
            "港名・3戦略カテゴリ・発展カード名など公式語句を使い、狙う資源枚数や建設位置を具体的に書いてください。",
            "港案内は現在の街道網から到達可能かを確認し、街道本数や必要資源と妨害状況を明記してください。実現不能なら理由と都市化手順を返してください。",
            "テンプレートの再掲は不要です。質問に対する回答のみを返してください。",
        ]
    )
    followup_sections = [
        prompt,
        instructions,
        "### 直近の交渉アドバイス",
        advice.strip() if advice else "なし",
    ]
    if history_lines:
        followup_sections.extend(["### これまでの質問と回答", "\n".join(history_lines)])
    followup_sections.extend(["### 今回の質問", question.strip()])
    prompt_with_instructions = "\n\n".join(followup_sections)
    logging.info(
        "Negotiation followup prompt ready: model=%s temp=%s board_image=%s prompt_chars=%d",
        model,
        temperature if temperature is not None else "default",
        bool(board_image_data_url),
        len(prompt_with_instructions),
    )
    if board_image_data_url:
        image_suffix = (
            "プレイヤー情報および盤面情報を参照して回答してください。"
            "画像を確認したと分かる短い一言を添えてください。"
        )
        prompt_with_instructions = f"{prompt_with_instructions}\n\n{image_suffix}"
    if board_image_data_url:
        user_content: Any = [
            {"type": "text", "text": prompt_with_instructions},
            {
                "type": "image_url",
                "image_url": {"url": board_image_data_url, "detail": "low"},
            },
        ]
    else:
        user_content = prompt_with_instructions
    request_kwargs: Dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "あなたはカタンの交渉支援AIエージェントです。プレイヤー情報および盤面情報を参照して初心者プレイヤーの交渉の手助けをしてください。以下のテンプレートを厳守し、日本語で回答してください。",
            },
            {
                "role": "user",
                "content": user_content,
            },
        ],
    }
    if temperature is not None:
        request_kwargs["temperature"] = temperature
    logging.info(
        "Negotiation followup request -> model=%s temp=%s board_image=%s",
        request_kwargs.get("model"),
        request_kwargs.get("temperature", "default"),
        bool(board_image_data_url),
    )
    logging.info("Negotiation followup prompt:\n%s", prompt_with_instructions)

    def _execute_request() -> Any:
        return client.chat.completions.create(**request_kwargs)

    try:
        response = _execute_request()
    except OpenAIError as exc:
        error_code = getattr(exc, "code", None)
        error_message = str(exc).lower()
        model_missing = (error_code == "model_not_found") or (
            "model_not_found" in error_message
            or "does not exist" in error_message
            or "do not have access" in error_message
        )
        if temperature is not None and error_code == "unsupported_value":
            logging.warning(
                "Negotiation followup temperature unsupported (temp=%s). Retrying without it.",
                temperature,
            )
            request_kwargs.pop("temperature", None)
            response = _execute_request()
        elif model_missing and request_kwargs.get("model") not in (fallback_model, None):
            logging.warning(
                "Negotiation followup model '%s' not found. Falling back to '%s'.",
                request_kwargs.get("model"),
                fallback_model,
            )
            request_kwargs["model"] = fallback_model
            response = _execute_request()
        else:
            raise

    choices = getattr(response, "choices", [])
    if not choices:
        raise NegotiationAdviceError("OpenAI API response did not include any choices.")
    answer = choices[0].message.content if choices[0].message else None
    if not answer:
        raise NegotiationAdviceError("OpenAI API response did not include text content.")
    return answer.strip(), context


def request_negotiation_advice(
    game: Game,
    board_image_data_url: str | None = None,
    requester_color: str | None = None,
) -> Dict[str, Any]:
    """
    Public helper that hides the raw OpenAI payload and only returns fields that the API
    endpoint should expose.
    """
    advice, _ = generate_negotiation_advice(
        game, board_image_data_url, requester_color
    )
    return {"advice": advice}


def request_negotiation_followup(
    game: Game,
    question: str,
    advice: str | None = None,
    history: List[Dict[str, str]] | None = None,
    board_image_data_url: str | None = None,
    requester_color: str | None = None,
) -> Dict[str, Any]:
    answer, _ = generate_negotiation_followup(
        game,
        question,
        advice,
        history,
        board_image_data_url,
        requester_color,
    )
    return {"answer": answer}
