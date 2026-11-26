import { describe, expect, it } from "vitest";
import { buildTopicCompletion, groupTrainingsByTopic, topicKeyFor, type TopicAttendee, type TopicTraining } from "./procedure-training-topic-rollup";
import type { PassStatusResult, PassStatusRound } from "./procedure-training-pass-status";

// "1 chủ đề đào tạo có thể mở nhiều lớp nhiều đợt vào nhiều ngày khác
// nhau... nếu tham gia đợt này nhưng cần học lại thì có thể đăng ký lại để
// học lại đợt khác để đạt... chỉ tổng hợp kết quả nhân viên hoàn thành bài
// đào tạo nhưng chỉ khác ngày hoàn thành."
describe("procedure-training-topic-rollup", () => {
  describe("topicKeyFor", () => {
    it("gộp theo document_publication_id khi có — kể cả tên khác nhau", () => {
      const a = topicKeyFor({ document_publication_id: "doc-1", procedure_name: "ATPT đợt 1" });
      const b = topicKeyFor({ document_publication_id: "doc-1", procedure_name: "ATPT đợt 2 (tên gõ khác)" });
      expect(a).toBe(b);
    });

    it("không có document_publication_id thì gộp theo procedure_name đã chuẩn hoá (trim + lowercase)", () => {
      const a = topicKeyFor({ document_publication_id: null, procedure_name: "  Quy chế HSBA  " });
      const b = topicKeyFor({ document_publication_id: null, procedure_name: "quy chế hsba" });
      expect(a).toBe(b);
    });

    it("khác document_publication_id thì khác key dù tên giống nhau", () => {
      const a = topicKeyFor({ document_publication_id: "doc-1", procedure_name: "ATPT" });
      const b = topicKeyFor({ document_publication_id: "doc-2", procedure_name: "ATPT" });
      expect(a).not.toBe(b);
    });
  });

  describe("groupTrainingsByTopic", () => {
    const base: TopicTraining = { id: "", procedure_name: "ATPT", document_publication_id: null, effective_date: null, pass_threshold: 14 };
    it("chỉ giữ lại nhóm có TỪ 2 đợt trở lên", () => {
      const trainings: TopicTraining[] = [
        { ...base, id: "t1", procedure_name: "ATPT" },
        { ...base, id: "t2", procedure_name: "ATPT" },
        { ...base, id: "t3", procedure_name: "Quy chế khác" },
      ];
      const groups = groupTrainingsByTopic(trainings);
      expect(groups.size).toBe(1);
      expect([...groups.values()][0].map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    });

    it("không có nhóm nào khi mọi chủ đề chỉ có đúng 1 đợt", () => {
      const trainings: TopicTraining[] = [
        { ...base, id: "t1", procedure_name: "A" },
        { ...base, id: "t2", procedure_name: "B" },
      ];
      expect(groupTrainingsByTopic(trainings).size).toBe(0);
    });
  });

  describe("buildTopicCompletion", () => {
    const trainings: TopicTraining[] = [
      { id: "t1", procedure_name: "ATPT đợt 1", document_publication_id: "doc-1", effective_date: "2026-10-01", pass_threshold: 14 },
      { id: "t2", procedure_name: "ATPT đợt 2", document_publication_id: "doc-1", effective_date: "2026-11-01", pass_threshold: 14 },
    ];
    const round1: PassStatusRound = { id: "r1", sort_order: 1, round_date: null };
    const round2: PassStatusRound = { id: "r2", sort_order: 1, round_date: null };
    const roundsByTraining = new Map<string, PassStatusRound[]>([
      ["t1", [round1]],
      ["t2", [round2]],
    ]);

    it("người KHÔNG đạt ở đợt 1 nhưng đăng ký học lại và ĐẠT ở đợt 2 → trạng thái gộp là Đạt, ghi nhận đúng đợt đã đạt", () => {
      const attendees: TopicAttendee[] = [
        { id: "a1", training_id: "t1", employee_code: "NV01", employee_name: "Nguyễn Văn A", department: "Khoa A", job_title: "Bác sĩ", attended: true },
        { id: "a2", training_id: "t2", employee_code: "NV01", employee_name: "Nguyễn Văn A", department: "Khoa A", job_title: "Bác sĩ", attended: true },
      ];
      const results: PassStatusResult[] = [{ round_id: "r1", score: 10 }];
      const results2: PassStatusResult[] = [{ round_id: "r2", score: 16 }];
      const resultsByAttendeeId = new Map<string, PassStatusResult[]>([
        ["a1", results],
        ["a2", results2],
      ]);
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, resultsByAttendeeId);
      expect(rollup).toHaveLength(1);
      expect(rollup[0].status).toBe("pass");
      expect(rollup[0].passedTraining?.trainingId).toBe("t2");
      expect(rollup[0].attemptCount).toBe(2);
    });

    it("người không đạt ở BẤT KỲ đợt nào trong chủ đề → trạng thái gộp là Không đạt", () => {
      const attendees: TopicAttendee[] = [
        { id: "b1", training_id: "t1", employee_code: "NV02", employee_name: "Trần Thị B", department: null, job_title: null, attended: true },
        { id: "b2", training_id: "t2", employee_code: "NV02", employee_name: "Trần Thị B", department: null, job_title: null, attended: true },
      ];
      const resultsByAttendeeId = new Map<string, PassStatusResult[]>([
        ["b1", [{ round_id: "r1", score: 8 }]],
        ["b2", [{ round_id: "r2", score: 9 }]],
      ]);
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, resultsByAttendeeId);
      expect(rollup[0].status).toBe("fail");
      expect(rollup[0].passedTraining).toBeNull();
    });

    // Báo cáo thực tế: "Nút theo chủ đề ko lấy đủ số lượng" — người không có
    // mã NV trước đây bị loại HẲN khỏi bảng gộp; giờ vẫn phải xuất hiện,
    // gộp theo tên đã chuẩn hoá (không có mã để hiển thị thì cột Mã NV là
    // null, UI hiện "—").
    it("người không có mã NV vẫn xuất hiện trong bảng gộp (gộp theo tên đã chuẩn hoá), employeeCode là null", () => {
      const attendees: TopicAttendee[] = [{ id: "c1", training_id: "t1", employee_code: null, employee_name: "Không Mã", department: null, job_title: null, attended: true }];
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, new Map());
      expect(rollup).toHaveLength(1);
      expect(rollup[0].employeeCode).toBeNull();
      expect(rollup[0].employeeName).toBe("Không Mã");
    });

    it("cùng 1 người không mã NV ở 2 đợt khác nhau, tên lệch dấu/hoa-thường → vẫn gộp thành 1 dòng duy nhất", () => {
      const attendees: TopicAttendee[] = [
        { id: "d1", training_id: "t1", employee_code: null, employee_name: "Nguyễn Thị Ngọc Quyên", department: null, job_title: null, attended: true },
        { id: "d2", training_id: "t2", employee_code: null, employee_name: "NGUYEN THI NGOC QUYEN", department: null, job_title: null, attended: true },
      ];
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, new Map());
      expect(rollup).toHaveLength(1);
      expect(rollup[0].attemptCount).toBe(2);
    });

    it("người chưa làm bài ở đợt nào cả → trạng thái gộp là 'none', không phải 'fail'", () => {
      const attendees: TopicAttendee[] = [{ id: "e1", training_id: "t1", employee_code: "NV03", employee_name: "Lê Văn C", department: null, job_title: null, attended: false }];
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, new Map());
      expect(rollup[0].status).toBe("none");
    });
  });
});
