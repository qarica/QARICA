export type QlclRecurringBlueprintCadence =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY_DATE"
  | "MONTHLY_WEEK"
  | "QUARTERLY"
  | "YEARLY";

export type QlclRecurringBlueprint = {
  code: string;
  title: string;
  sourceLabel: string;
  cadence: QlclRecurringBlueprintCadence;
  criteria: string[];
  departmentHint: string;
  ownerHint: string;
  expectedResult: string;
  evidenceRequirement: string;
  description: string;
  scheduleHint: string;
  scheduleNeedsChoice: boolean;
  weekday?: string;
  monthDay?: number;
  weekOfMonth?: number;
  startMonth?: number;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  automationKind?: "ACTION" | "MONITORING";
  automationChecklistCode?: string;
  automationTargetArea?: string;
};

const SOURCE = "Sổ tay tác nghiệp QLCL 2026 · Phần II";

export const QLCL_RECURRING_BLUEPRINTS: QlclRecurringBlueprint[] = [
  {
    code:"HN-01", title:"Đi buồng chất lượng, kiểm tra vệ sinh và an toàn khoa phòng", sourceLabel:SOURCE,
    cadence:"DAILY", criteria:["A2","A3","C1","D2.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Phiếu đi buồng được hoàn tất và tồn tại được giao xử lý theo trách nhiệm.",
    evidenceRequirement:"Phiếu đi buồng đã điền; ảnh minh họa nếu có; ghi nhận tồn tại và thời hạn khắc phục.",
    description:"Đi buồng chất lượng tại 1–2 khoa theo lịch luân phiên; kiểm tra vệ sinh, biển báo, an toàn, giao tiếp và các nguy cơ môi trường.",
    scheduleHint:"Mỗi ngày làm việc.", scheduleNeedsChoice:false, priority:"NORMAL",
  },
  {
    code:"HN-02", title:"Tiếp nhận, phân loại và vào sổ báo cáo sự cố y khoa", sourceLabel:SOURCE,
    cadence:"DAILY", criteria:["D2.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Sự cố mới được tiếp nhận, phân loại sơ bộ và đưa vào đúng luồng xử lý.",
    evidenceRequirement:"Phiếu báo cáo sự cố; sổ/theo dõi sự cố; phân loại sơ bộ.",
    description:"Rà soát nguồn tiếp nhận sự cố, ghi nhận và phân loại để chuyển sang xác minh/điều tra khi cần.",
    scheduleHint:"Mỗi ngày làm việc.", scheduleNeedsChoice:false, priority:"HIGH",
  },
  {
    code:"HN-03", title:"Rà soát ý kiến, phàn nàn của người bệnh và phản hồi trong 24 giờ", sourceLabel:SOURCE,
    cadence:"DAILY", criteria:["A4.5"], departmentHint:"Phòng Marketing & CSKH", ownerHint:"CSKH",
    expectedResult:"Ý kiến/phàn nàn mới có đầu mối xử lý và được theo dõi thời hạn phản hồi.",
    evidenceRequirement:"Sổ tiếp nhận ý kiến; kết quả xử lý/phản hồi; bằng chứng đôn đốc nếu trễ.",
    description:"CSKH xử lý ý kiến; QLCL giám sát tiến độ đối với nội dung liên quan chất lượng và an toàn.",
    scheduleHint:"Mỗi ngày làm việc.", scheduleNeedsChoice:false, priority:"HIGH",
  },
  {
    code:"HN-04", title:"Ghi nhật ký công tác QLCL cuối ngày", sourceLabel:SOURCE,
    cadence:"DAILY", criteria:["D1.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Công việc trong ngày được chốt, việc tồn và việc cần đôn đốc ngày sau được ghi nhận.",
    evidenceRequirement:"Nhật ký công tác QLCL có ngày, nội dung, tình trạng và việc tiếp theo.",
    description:"Chốt cuối ngày các việc đã làm, tồn đọng và đầu việc cần theo dõi tiếp.",
    scheduleHint:"Cuối mỗi ngày làm việc.", scheduleNeedsChoice:false, priority:"NORMAL",
  },
  {
    code:"HT-01", title:"Giám sát tuân thủ theo chủ đề luân phiên", sourceLabel:SOURCE,
    cadence:"WEEKLY", criteria:["C4.3","D2.4","C9.4","C5.5"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Có kết quả giám sát chủ đề tuần, phản hồi cho đơn vị và hành động khi không đạt.",
    evidenceRequirement:"Bảng kiểm đã chấm; tỷ lệ tuân thủ; phản hồi và tái giám sát khi cần.",
    description:"Giám sát tuân thủ theo chủ đề luân phiên bằng bảng kiểm phù hợp.",
    scheduleHint:"Mỗi tuần 1 chủ đề; nguồn không ấn định thứ cụ thể.", scheduleNeedsChoice:true, weekday:"MO", priority:"HIGH",
  },
  {
    code:"HT-02", title:"Bình bệnh án", sourceLabel:SOURCE,
    cadence:"WEEKLY", criteria:["C2.1","C2.2"], departmentHint:"Phòng Kế hoạch tổng hợp", ownerHint:"KHTH",
    expectedResult:"Hồ sơ bệnh án mẫu được chấm; lỗi thường gặp và hành động khắc phục được tổng hợp.",
    evidenceRequirement:"Biên bản bình bệnh án; danh sách hồ sơ; bảng kiểm/lỗi thường gặp.",
    description:"Rút hồ sơ theo kế hoạch, chấm chất lượng ghi chép và phản hồi các lỗi cần khắc phục.",
    scheduleHint:"Mỗi tuần; nguồn không ấn định thứ cụ thể.", scheduleNeedsChoice:true, weekday:"WE", priority:"HIGH",
  },
  {
    code:"HT-03", title:"Giao ban chất lượng với Ban Giám đốc", sourceLabel:SOURCE,
    cadence:"WEEKLY", criteria:["D1.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Ba vấn đề chất lượng nổi bật và hướng xử lý được báo cáo/lưu vết.",
    evidenceRequirement:"Biên bản hoặc ghi chú giao ban có kết luận, người phụ trách và hạn.",
    description:"Giao ban ngắn tập trung vào việc cần quyết định, việc trễ và rủi ro nổi bật.",
    scheduleHint:"Mỗi tuần; nguồn không ấn định thứ cụ thể.", scheduleNeedsChoice:true, weekday:"FR", priority:"HIGH",
  },
  {
    code:"HT-04", title:"Tổng hợp kết quả tuần và phản hồi cho khoa phòng", sourceLabel:SOURCE,
    cadence:"WEEKLY", criteria:["D3.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Kết quả tuần được tổng hợp và phản hồi đúng đơn vị phụ trách.",
    evidenceRequirement:"Bản tổng hợp tuần; phản hồi/đôn đốc; danh sách việc tồn.",
    description:"Tổng hợp giám sát, sự cố, tồn tại và Action trong tuần để phản hồi khoa/phòng.",
    scheduleHint:"Cuối mỗi tuần.", scheduleNeedsChoice:true, weekday:"FR", priority:"NORMAL",
  },
  {
    code:"HTh-01", title:"Thu thập và tổng hợp bộ chỉ số chất lượng", sourceLabel:SOURCE,
    cadence:"MONTHLY_DATE", criteria:["D3.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Bộ chỉ số tháng được tổng hợp, xác thực và có nhận xét xu hướng.",
    evidenceRequirement:"Báo cáo chỉ số chất lượng tháng; dữ liệu nguồn/xác thực; nhận xét và hành động nếu bất thường.",
    description:"Thu thập số liệu từ các đơn vị, kiểm tra tính đầy đủ và tổng hợp bộ chỉ số chất lượng.",
    scheduleHint:"Ngày 01–05 tháng sau; cần chọn ngày vận hành cụ thể.", scheduleNeedsChoice:true, monthDay:5, priority:"HIGH",
  },
  {
    code:"HTh-02", title:"Tổng hợp và phân tích sự cố y khoa tháng", sourceLabel:SOURCE,
    cadence:"MONTHLY_DATE", criteria:["D2.2","D2.3"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Có báo cáo sự cố tháng, xu hướng và danh sách sự cố cần RCA/CAPA.",
    evidenceRequirement:"Báo cáo sự cố tháng; biên bản/phân tích RCA khi có chỉ định; hành động khắc phục.",
    description:"Tổng hợp sự cố tháng, phân tích xu hướng và chọn trường hợp cần phân tích sâu.",
    scheduleHint:"Ngày 01–05 tháng sau; cần chọn ngày vận hành cụ thể.", scheduleNeedsChoice:true, monthDay:5, priority:"HIGH",
  },
  {
    code:"HTh-03", title:"Sinh hoạt mạng lưới QLCL", sourceLabel:SOURCE,
    cadence:"MONTHLY_WEEK", criteria:["D1.1","D1.3"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Mạng lưới được phản hồi kết quả và thống nhất các hành động cần thực hiện.",
    evidenceRequirement:"Biên bản sinh hoạt mạng lưới; kết luận; phân công và thời hạn.",
    description:"Phản hồi kết quả giám sát, chỉ số, sự cố và tiến độ khắc phục cho mạng lưới.",
    scheduleHint:"Tuần thứ 2 hằng tháng; cần chọn thứ cụ thể.", scheduleNeedsChoice:true, weekday:"WE", weekOfMonth:2, priority:"NORMAL",
  },
  {
    code:"HTh-04", title:"Khảo sát hài lòng người bệnh và nhập liệu", sourceLabel:SOURCE,
    cadence:"MONTHLY_DATE", criteria:["A4.6"], departmentHint:"Phòng Marketing & CSKH", ownerHint:"CSKH",
    expectedResult:"Khảo sát tháng được hoàn thành và dữ liệu được nhập/tổng hợp.",
    evidenceRequirement:"Phiếu/dữ liệu khảo sát; bảng phân tích; danh sách ý kiến cần cải thiện.",
    description:"Khảo sát hài lòng người bệnh nội trú, ngoại trú theo mẫu áp dụng và chốt dữ liệu cuối tháng.",
    scheduleHint:"Cả tháng, chốt cuối tháng; cần chọn ngày chốt.", scheduleNeedsChoice:true, monthDay:28, priority:"NORMAL",
  },
  {
    code:"HTh-05", title:"Lập báo cáo chất lượng tháng trình Ban Giám đốc", sourceLabel:SOURCE,
    cadence:"MONTHLY_DATE", criteria:["D3.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Báo cáo chất lượng tháng được trình đúng hạn, nêu rõ vấn đề và việc cần quyết định.",
    evidenceRequirement:"Báo cáo chất lượng tháng; bằng chứng trình/nhận; kết luận chỉ đạo nếu có.",
    description:"Tổng hợp chỉ số, giám sát, sự cố, tồn tại và tiến độ cải tiến thành báo cáo tháng.",
    scheduleHint:"Trước ngày 10 tháng sau; cần chọn ngày trình nội bộ.", scheduleNeedsChoice:true, monthDay:8, priority:"HIGH",
  },
  {
    code:"HTh-06", title:"Cập nhật hồ sơ minh chứng theo mã tiêu chí", sourceLabel:SOURCE,
    cadence:"MONTHLY_DATE", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Minh chứng mới được gắn đúng mã tiêu chí và khoảng trống được nhận diện sớm.",
    evidenceRequirement:"Danh mục minh chứng cập nhật; ghi nhận thiếu/không phù hợp và người xử lý.",
    description:"Rà hồ sơ phát sinh trong tháng và cập nhật vào cấu trúc minh chứng theo 83 tiêu chí.",
    scheduleHint:"Cuối mỗi tháng; cần chọn ngày chốt.", scheduleNeedsChoice:true, monthDay:28, priority:"NORMAL",
  },
  {
    code:"HQ-01", title:"Họp Hội đồng Quản lý chất lượng", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["D1.1","D1.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Hội đồng xem xét chỉ số, tiến độ cải tiến, tồn tại và ban hành kết luận.",
    evidenceRequirement:"Biên bản họp Hội đồng; tài liệu họp; kết luận, phân công và hạn.",
    description:"Họp Hội đồng QLCL theo quý để xem xét hệ thống và quyết định các nội dung vượt thẩm quyền vận hành.",
    scheduleHint:"Mỗi quý; nguồn không ấn định ngày.", scheduleNeedsChoice:true, monthDay:25, priority:"HIGH",
  },
  {
    code:"HQ-02", title:"Đào tạo nội bộ về chất lượng và an toàn người bệnh", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["B2.1","D1.3"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Tối thiểu một chuyên đề được tổ chức và có hồ sơ đào tạo đầy đủ.",
    evidenceRequirement:"Kế hoạch; danh sách; bài giảng; biên bản; ảnh/minh chứng đào tạo.",
    description:"Tổ chức đào tạo nội bộ về quản lý chất lượng và an toàn người bệnh.",
    scheduleHint:"Mỗi quý 1 chuyên đề; cần chọn ngày tổ chức.", scheduleNeedsChoice:true, monthDay:20, priority:"NORMAL",
  },
  {
    code:"HQ-03", title:"Đánh giá tiến độ kế hoạch cải tiến và các đề án", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["D1.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Tiến độ đề án và Action được rà soát; blocker và việc trễ có người xử lý.",
    evidenceRequirement:"Báo cáo/biên bản rà soát tiến độ; danh sách blocker và hành động tiếp theo.",
    description:"Rà soát tiến độ danh mục đề án cải tiến, SMART/PDSA và Action.",
    scheduleHint:"Mỗi quý; nguồn không ấn định ngày.", scheduleNeedsChoice:true, monthDay:20, priority:"HIGH",
  },
  {
    code:"HQ-04", title:"Rà soát tiến độ khắc phục tồn tại sau kiểm tra", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Mỗi tồn tại có trạng thái, bằng chứng và hành động tiếp theo nếu chưa đóng.",
    evidenceRequirement:"Bảng theo dõi khắc phục; bằng chứng xác nhận; biên bản/kết luận rà soát.",
    description:"Rà soát các kiến nghị/tồn tại từ đoàn kiểm tra và tự đánh giá đến khi đóng bằng bằng chứng.",
    scheduleHint:"Mỗi quý; nguồn không ấn định ngày.", scheduleNeedsChoice:true, monthDay:20, priority:"HIGH",
  },
  {
    code:"HQ-05", title:"Lập báo cáo chất lượng quý", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["D3.3"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Báo cáo quý được hoàn thành và gửi đúng nơi nhận khi có yêu cầu.",
    evidenceRequirement:"Báo cáo chất lượng quý; bằng chứng trình/gửi; phản hồi tiếp nhận nếu có.",
    description:"Tổng hợp tình hình chất lượng quý cho Ban Giám đốc và cơ quan quản lý khi được yêu cầu.",
    scheduleHint:"Mỗi quý; cần chọn ngày chốt/trình.", scheduleNeedsChoice:true, monthDay:28, priority:"NORMAL",
  },
  {
    code:"6T-01", title:"Tự kiểm tra giữa năm theo 83 tiêu chí", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Có biên bản tự đánh giá giữa năm, điểm và danh mục khoảng trống.",
    evidenceRequirement:"Biên bản tự đánh giá 6 tháng; bảng điểm; danh mục minh chứng và khoảng trống.",
    description:"Tổ chức tự kiểm tra giữa năm theo 83 tiêu chí và xác định hành động khắc phục.",
    scheduleHint:"Tháng 7; cần chọn ngày triển khai cụ thể.", scheduleNeedsChoice:true, startMonth:7, monthDay:15, priority:"HIGH",
  },
  {
    code:"6T-02", title:"Khảo sát hài lòng nhân viên y tế", sourceLabel:SOURCE,
    cadence:"QUARTERLY", criteria:["B3.3","B3.4"], departmentHint:"Phòng Tổ chức hành chính", ownerHint:"Nhân sự",
    expectedResult:"Khảo sát nhân viên được hoàn thành, phân tích và có kế hoạch cải thiện.",
    evidenceRequirement:"Báo cáo khảo sát; dữ liệu; phân tích; kế hoạch cải thiện.",
    description:"Thực hiện khảo sát hài lòng nhân viên y tế theo các đợt trong năm.",
    scheduleHint:"Tháng 7 và tháng 12; engine hiện cần chọn lịch cụ thể, nên xác nhận khi tạo.", scheduleNeedsChoice:true, monthDay:15, priority:"NORMAL",
  },
  {
    code:"6T-03", title:"Báo cáo phân tích sự cố y khoa 6 tháng", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D2.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Có báo cáo phân tích sự cố 6 tháng và hành động ưu tiên.",
    evidenceRequirement:"Báo cáo phân tích 6 tháng; dữ liệu nguồn; hành động khắc phục/phòng ngừa.",
    description:"Tổng hợp và phân tích sự cố y khoa theo chu kỳ 6 tháng.",
    scheduleHint:"Tháng 7 và tháng 1; cần cấu hình lịch phù hợp từng chu kỳ.", scheduleNeedsChoice:true, startMonth:7, monthDay:10, priority:"HIGH",
  },
  {
    code:"N-01", title:"Dựng nền – ban hành các văn bản tổ chức hệ thống QLCL", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D1.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Hệ thống văn bản tổ chức QLCL đầu năm được rà soát/ban hành đầy đủ.",
    evidenceRequirement:"Quyết định/quy chế/danh sách mạng lưới và bằng chứng phổ biến.",
    description:"Rà soát và kiện toàn nền tảng tổ chức hệ thống quản lý chất lượng.",
    scheduleHint:"Tháng 1; cần chọn ngày cụ thể.", scheduleNeedsChoice:true, startMonth:1, monthDay:15, priority:"HIGH",
  },
  {
    code:"N-02", title:"Xây dựng kế hoạch cải tiến chất lượng năm", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D1.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Kế hoạch chất lượng/cải tiến năm được xây dựng, thẩm định và phê duyệt.",
    evidenceRequirement:"Kế hoạch được phê duyệt; biên bản/thẩm định nếu áp dụng.",
    description:"Xây dựng kế hoạch cải tiến chất lượng dựa trên kết quả đánh giá và ưu tiên năm.",
    scheduleHint:"Tháng 1–2; cần chọn ngày trình.", scheduleNeedsChoice:true, startMonth:2, monthDay:15, priority:"HIGH",
  },
  {
    code:"N-03", title:"Ban hành bộ chỉ số chất lượng năm", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.2"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Danh mục chỉ số và Bộ thông tin chỉ số đủ điều kiện được phê duyệt.",
    evidenceRequirement:"Danh mục chỉ số; Bộ thông tin; phân công; quyết định/phê duyệt.",
    description:"Rà soát, phân công và ban hành bộ chỉ số chất lượng năm.",
    scheduleHint:"Tháng 1–2; cần chọn ngày ban hành.", scheduleNeedsChoice:true, startMonth:2, monthDay:20, priority:"HIGH",
  },
  {
    code:"N-04", title:"Tự kiểm tra, đánh giá chất lượng cuối kỳ theo 83 tiêu chí", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Tự đánh giá cuối kỳ hoàn thành, có điểm, minh chứng và danh sách hành động.",
    evidenceRequirement:"Kế hoạch/quyết định đoàn; phiếu chấm; biên bản; bảng điểm; danh mục minh chứng.",
    description:"Tổ chức tự kiểm tra, đánh giá chất lượng cuối kỳ theo 83 tiêu chí.",
    scheduleHint:"Tháng 1–3 năm sau; cần chọn ngày khởi động.", scheduleNeedsChoice:true, startMonth:2, monthDay:1, priority:"CRITICAL",
  },
  {
    code:"N-05", title:"Nhập kết quả lên cổng chatluongbenhvien.vn", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Kết quả tự đánh giá được nhập đầy đủ trước hạn.",
    evidenceRequirement:"Ảnh/chứng từ xác nhận nhập dữ liệu; dữ liệu đối soát trước khi nộp.",
    description:"Nhập kết quả tự đánh giá lên cổng chất lượng theo quy định.",
    scheduleHint:"Trước 20/3 năm sau; chọn ngày nội bộ sớm hơn hạn.", scheduleNeedsChoice:true, startMonth:3, monthDay:15, priority:"CRITICAL",
  },
  {
    code:"N-06", title:"Lập và nộp hồ sơ báo cáo về Sở Y tế", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Bộ hồ sơ báo cáo được trình ký và nộp đúng hạn.",
    evidenceRequirement:"Bộ hồ sơ báo cáo; văn bản trình ký; bằng chứng nộp/tiếp nhận.",
    description:"Hoàn thiện và nộp hồ sơ báo cáo chất lượng năm về Sở Y tế.",
    scheduleHint:"Trước 20/3 năm sau; chọn ngày nội bộ sớm hơn hạn.", scheduleNeedsChoice:true, startMonth:3, monthDay:15, priority:"CRITICAL",
  },
  {
    code:"N-07", title:"Tiếp đoàn kiểm tra của Sở Y tế", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.3"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Hồ sơ và đầu mối tiếp đoàn được chuẩn bị; nhận xét của đoàn được ghi nhận đầy đủ.",
    evidenceRequirement:"Checklist tiếp đoàn; danh mục hồ sơ; biên bản/nhận xét của đoàn.",
    description:"Chuẩn bị và điều phối tiếp đoàn kiểm tra chất lượng.",
    scheduleHint:"Quý II năm sau; lịch phụ thuộc thông báo của Sở Y tế nên cần xác nhận khi có ngày.", scheduleNeedsChoice:true, startMonth:6, monthDay:15, priority:"CRITICAL",
  },
  {
    code:"N-08", title:"Lập kế hoạch khắc phục tồn tại sau kiểm tra", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Tồn tại sau kiểm tra được chuyển thành kế hoạch hành động có người, hạn và minh chứng.",
    evidenceRequirement:"Kế hoạch khắc phục; bảng theo dõi Action; bằng chứng đóng tồn tại.",
    description:"Chuyển nhận xét/kiến nghị của đoàn thành Action theo dõi đến khi đóng.",
    scheduleHint:"Trong 30 ngày sau kiểm tra; cần chọn ngày sau khi có biên bản chính thức.", scheduleNeedsChoice:true, startMonth:7, monthDay:15, priority:"CRITICAL",
  },
  {
    code:"N-09", title:"Báo cáo tổng kết công tác chất lượng năm", sourceLabel:SOURCE,
    cadence:"YEARLY", criteria:["D3.1"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Báo cáo tổng kết năm được hoàn thành và trình lãnh đạo.",
    evidenceRequirement:"Báo cáo tổng kết; số liệu đã đối soát; bằng chứng trình/duyệt.",
    description:"Tổng hợp kết quả quản lý chất lượng, chỉ số, giám sát, sự cố, cải tiến và tồn tại cuối năm.",
    scheduleHint:"Tháng 12; cần chọn ngày chốt dữ liệu/trình.", scheduleNeedsChoice:true, startMonth:12, monthDay:20, priority:"HIGH",
  },
  {
    code:"GS-TRUOTNGA-2026", title:"Giám sát các vị trí có nguy cơ trượt, ngã", sourceLabel:"Kế hoạch giám sát các vị trí có nguy cơ trượt, ngã năm 2026",
    cadence:"MONTHLY_DATE", criteria:["D2.1","D2.5"], departmentHint:"Phòng Quản lý chất lượng", ownerHint:"QLCL",
    expectedResult:"Vị trí nguy cơ được nhận diện; nội dung không đạt có đề xuất khắc phục và được kiểm tra lại.",
    evidenceRequirement:"Bảng kiểm trượt/ngã; ảnh minh chứng nếu cần; danh mục vị trí nguy cơ; hồ sơ khắc phục và kết quả kiểm tra lại.",
    description:"Giám sát hiện trường các khu vực có nguy cơ trượt, ngã; theo dõi hành động khắc phục.",
    scheduleHint:"Kế hoạch nguồn quy định giám sát hằng ngày/đột xuất và rà soát toàn bộ; chọn ngày chạy đợt định kỳ trong hệ thống.", scheduleNeedsChoice:true, monthDay:15, priority:"HIGH",
    automationKind:"MONITORING", automationChecklistCode:"BANGKIEM_TRUOTNGA.V1_QLCL.01", automationTargetArea:"Toàn bộ Tòa A và Tòa B",
  },
];

export function findRecurringBlueprint(code: string) {
  return QLCL_RECURRING_BLUEPRINTS.find((item) => item.code === code) || null;
}
