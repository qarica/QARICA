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
        { training_id: "t1", employee_code: "NV01", employee_name: "Nguyễn Văn A", department: "Khoa A", job_title: "Bác sĩ", attended: true },
        { training_id: "t2", employee_code: "NV01", employee_name: "Nguyễn Văn A", department: "Khoa A", job_title: "Bác sĩ", attended: true },
      ];
      const results: PassStatusResult[] = [{ round_id: "r1", score: 10 }];
      const results2: PassStatusResult[] = [{ round_id: "r2", score: 16 }];
      const resultsByAttendeeId = new Map<string, PassStatusResult[]>([
        ["a1", results],
        ["a2", results2],
      ]);
      const attendeeIdByTrainingAndCode = new Map([
        ["t1:NV01", "a1"],
        ["t2:NV01", "a2"],
      ]);
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, resultsByAttendeeId, attendeeIdByTrainingAndCode);
      expect(rollup).toHaveLength(1);
      expect(rollup[0].status).toBe("pass");
      expect(rollup[0].passedTraining?.trainingId).toBe("t2");
      expect(rollup[0].attemptCount).toBe(2);
    });

    it("người không đạt ở BẤT KỲ đợt nào trong chủ đề → trạng thái gộp là Không đạt", () => {
      const attendees: TopicAttendee[] = [
        { training_id: "t1", employee_code: "NV02", employee_name: "Trần Thị B", department: null, job_title: null, attended: true },
        { training_id: "t2", employee_code: "NV02", employee_name: "Trần Thị B", department: null, job_title: null, attended: true },
      ];
      const resultsByAttendeeId = new Map<string, PassStatusResult[]>([
        ["b1", [{ round_id: "r1", score: 8 }]],
        ["b2", [{ round_id: "r2", score: 9 }]],
      ]);
      const attendeeIdByTrainingAndCode = new Map([
        ["t1:NV02", "b1"],
        ["t2:NV02", "b2"],
      ]);
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, resultsByAttendeeId, attendeeIdByTrainingAndCode);
      expect(rollup[0].status).toBe("fail");
      expect(rollup[0].passedTraining).toBeNull();
    });

    it("người không có mã NV bị loại khỏi bảng gộp (không so khớp được chéo đợt theo tên)", () => {
      const attendees: TopicAttendee[] = [{ training_id: "t1", employee_code: null, employee_name: "Không mã", department: null, job_title: null, attended: true }];
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, new Map(), new Map());
      expect(rollup).toHaveLength(0);
    });

    it("người chưa làm bài ở đợt nào cả → trạng thái gộp là 'none', không phải 'fail'", () => {
      const attendees: TopicAttendee[] = [{ training_id: "t1", employee_code: "NV03", employee_name: "Lê Văn C", department: null, job_title: null, attended: false }];
      const rollup = buildTopicCompletion(trainings, attendees, roundsByTraining, new Map(), new Map());
      expect(rollup[0].status).toBe("none");
    });
  });
});
