// 필름·현상소 ↔ UserComment 직렬화/파싱 (FR-10).
// 표준 EXIF 태그가 없으므로 `Film: ...; DevLab: ...` 규칙으로 한 곳에서만 처리한다.
// 쓰기와 읽기가 같은 규칙을 쓰도록 직렬화/파싱을 이 모듈에 모은다.

/// 필름·현상소를 UserComment 문자열로 직렬화한다. (둘 다 비면 None)
pub fn serialize(film: Option<&str>, dev_lab: Option<&str>) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(f) = film.map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(format!("Film: {f}"));
    }
    if let Some(d) = dev_lab.map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(format!("DevLab: {d}"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

/// UserComment에서 (필름, 현상소)를 파싱한다. "키: 값; 키: 값" 규칙.
/// 우리 규칙이 아닌 일반 텍스트면 둘 다 None 으로 둔다.
pub fn parse(user_comment: &str) -> (Option<String>, Option<String>) {
    let mut film = None;
    let mut dev = None;
    for token in user_comment.split(';') {
        if let Some((k, v)) = token.split_once(':') {
            let key = k.trim().to_lowercase();
            let val = v.trim();
            if val.is_empty() {
                continue;
            }
            match key.as_str() {
                "film" => film = Some(val.to_string()),
                "devlab" | "dev lab" | "lab" | "현상소" => dev = Some(val.to_string()),
                _ => {}
            }
        }
    }
    (film, dev)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let s = serialize(Some("Portra 400"), Some("OO현상소")).unwrap();
        assert_eq!(s, "Film: Portra 400; DevLab: OO현상소");
        let (f, d) = parse(&s);
        assert_eq!(f.as_deref(), Some("Portra 400"));
        assert_eq!(d.as_deref(), Some("OO현상소"));
    }

    #[test]
    fn partial_and_empty() {
        assert_eq!(serialize(Some("HP5"), None).unwrap(), "Film: HP5");
        assert_eq!(serialize(None, None), None);
        let (f, d) = parse("그냥 메모");
        assert!(f.is_none() && d.is_none());
    }
}
