// 도메인 로직 — 검증, UserComment 직렬화/파싱.

pub mod usercomment;

/// EXIF DateTimeOriginal 문자열을 검증하고 표준형으로 정규화한다.
/// 입력/출력 형식: "YYYY:MM:DD HH:MM:SS" (느슨한 입력은 0 패딩으로 정규화).
pub fn validate_and_canonicalize_dto(input: &str) -> Result<String, String> {
    let s = input.trim();
    let (date, time) = s
        .split_once(' ')
        .ok_or_else(|| "형식은 'YYYY:MM:DD HH:MM:SS' 이어야 합니다".to_string())?;

    let dp: Vec<&str> = date.split(':').collect();
    let tp: Vec<&str> = time.split(':').collect();
    if dp.len() != 3 || tp.len() != 3 {
        return Err("형식은 'YYYY:MM:DD HH:MM:SS' 이어야 합니다".to_string());
    }

    let parse = |x: &str, what: &str| -> Result<i32, String> {
        x.trim()
            .parse::<i32>()
            .map_err(|_| format!("{what} 값이 숫자가 아닙니다: '{x}'"))
    };
    let year = parse(dp[0], "연")?;
    let month = parse(dp[1], "월")?;
    let day = parse(dp[2], "일")?;
    let hour = parse(tp[0], "시")?;
    let min = parse(tp[1], "분")?;
    let sec = parse(tp[2], "초")?;

    if !(1..=9999).contains(&year) {
        return Err(format!("연도 범위가 올바르지 않습니다: {year}"));
    }
    if !(1..=12).contains(&month) {
        return Err(format!("월은 1~12 입니다: {month}"));
    }
    let max_day = days_in_month(year, month);
    if !(1..=max_day).contains(&day) {
        return Err(format!("{year}년 {month}월은 1~{max_day}일 입니다: {day}"));
    }
    if !(0..=23).contains(&hour) {
        return Err(format!("시는 0~23 입니다: {hour}"));
    }
    if !(0..=59).contains(&min) {
        return Err(format!("분은 0~59 입니다: {min}"));
    }
    if !(0..=59).contains(&sec) {
        return Err(format!("초는 0~59 입니다: {sec}"));
    }

    Ok(format!(
        "{year:04}:{month:02}:{day:02} {hour:02}:{min:02}:{sec:02}"
    ))
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 31,
    }
}

fn is_leap_year(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_and_canonicalizes() {
        assert_eq!(
            validate_and_canonicalize_dto("1998:5:10 9:0:0").unwrap(),
            "1998:05:10 09:00:00"
        );
        assert_eq!(
            validate_and_canonicalize_dto("2000:02:29 12:00:00").unwrap(),
            "2000:02:29 12:00:00"
        );
    }

    #[test]
    fn rejects_invalid() {
        assert!(validate_and_canonicalize_dto("2001:02:29 00:00:00").is_err()); // 평년 2/29
        assert!(validate_and_canonicalize_dto("1998:13:01 00:00:00").is_err()); // 13월
        assert!(validate_and_canonicalize_dto("1998:05:10").is_err()); // 시간 없음
        assert!(validate_and_canonicalize_dto("not a date").is_err());
    }
}
