/**
 * Project Service
 * konstantyn
 * 2018-03-10
 */

var async = require('async');
var mime = require('mime-types');
var uuidGen = require('node-uuid');
var getResolution = require('get-video-dimensions');
var _ = require('underscore');
var gm = require('gm');
var path = require('path');

var helper = require('../helper/helper');
var config = require('../config/config');

var projectModel = require('../model/project.model');
var frameModel = require('../model/frame.model');
var overlayModel = require('../model/overlay.model');
var frameService = require('./frame.service');

module.exports = {
    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    getProjectList(userInfo, message, callback) {
        try {
            projectModel.getProjectListByUsrId(userInfo.usr_id, (err, projects) => {
                if (err) {
                    helper.response.onError(err, callback);
                    return;
                }

                helper.response.onSuccessPlus(callback, {
                    projects: projects
                });
            });
        } catch (err) {
            helper.response.onError('error: getProjectList', callback);
        }
    },

    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    generateSasToken(userInfo, message, callback) {
        try {
            helper.file.generateSasToken((err, data) => {
                helper.response.onSuccessPlus(callback, data);
            });
        } catch (err) {
            helper.response.onError('error: generateSasToken', callback);
        }
    },
    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    createProject(userInfo, message, callback) {
        try {
            let prj_name = message.prj_name;
            
            let notFilledFields = [];
            !prj_name ? notFilledFields.push('prj_name') : '';

            if (notFilledFields.length > 0) {
                helper.response.onError('Required fileds are not filled: ' + notFilledFields.toString(), callback);
                return;
            }

            projectModel.isProjectExist(userInfo.usr_id, prj_name, (err, isExist) => {
                if (err) {
                    helper.response.onError(err, callback);
                    return;
                }
                
                if (isExist) {
                    helper.response.onError('project already exists', callback);
                    return;
                }

                projectModel.createProject(userInfo.usr_id, prj_name, (_err, prj_id) => {
                    if (_err) {
                        helper.response.onError(_err, callback);
                        return;
                    }

                    helper.response.onSuccessPlus(callback, {
                        prj_id: prj_id
                    });
                });
            });
        } catch (err) {
            helper.response.onError('error: createProject', callback);
        }
    },

    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    deleteProject(userInfo, message, callback) {
        try {
            let prj_id = message.prj_id;

            let notFilledFields = [];
            !prj_id ? notFilledFields.push('prj_id') : '';
            
            if (notFilledFields.length > 0) {
                helper.response.onError('Required fileds are not filled: ' + notFilledFields.toString(), callback);
                return;
            }
            
            frameModel.getFramesByPrjId(prj_id, (err, frames) => {
                let parallelTasks = [];

                _.each(frames, (frame) => {
                    parallelTasks.push((parallel_callback) => {
                        frameService.deleteFrame(userInfo, {frm_id: frame.frm_id}, parallel_callback);
                    });
                });

                async.parallel(parallelTasks, (err) => {
                    if (err) {
                        helper.response.onError('error: deleteProject', callback);
                        return;
                    }

                    projectModel.deleteProject(prj_id, (err) => {
                        if (err) {
                            helper.response.onError(err, callback);
                            return;
                        }

                        helper.response.onSuccessPlus(callback, {prj_id: prj_id});
                    });
                });
            });            
        } catch (err) {
            helper.response.onError('error: deleteProject', callback);
        }
    },

    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    updateProject(userInfo, message, callback) {
        try {
            let prj_id = message.prj_id;
            let data = message.data;

            let notFilledFields = [];
            !prj_id ? notFilledFields.push('prj_id') : '';
            !data ? notFilledFields.push('data') : '';

            if (notFilledFields.length > 0) {
                helper.response.onError('Required fileds are not filled: ' + notFilledFields.toString(), callback);
                return;
            }

            projectModel.updateProject(prj_id, data, (err) => {
                if (err) {
                    helper.response.onError(err, callback);
                    return;
                }

                helper.response.onSuccessPlus(callback);
            });
        } catch (err) {
            helper.response.onError('error: updateProject', callback);
        }
    },

    /**
     * 
     * @param {*} number 
     */
    parseInt(number) {
        return Math.ceil(number) % 2 === 0 ? Math.ceil(number) : Math.ceil(number) + 1;
    },

    /**
     * 
     * @param {*} userInfo 
     * @param {*} message 
     * @param {*} callback 
     */
    concatenate(userInfo, message, setProgress, callback) {
        try {
            let prj_id = message.prj_id;
            let prj_scene_ratio = message.prj_scene_ratio;
            let prj_name = message.prj_name;

            let notFilledFields = [];
            !prj_id ? notFilledFields.push('prj_id') : '';
            !prj_scene_ratio ? notFilledFields.push('prj_scene_ratio') : '';
            !prj_name ? notFilledFields.push('prj_name') : '';
            if (notFilledFields.length > 0) {
                helper.response.onError('Required fileds are not filled: ' + notFilledFields.toString(), callback);
                return;
            }
            
            setProgress(10, 'Start Merge Frames');

            //Get All Frames
            frameModel.getFramesByPrjId(prj_id, (err, frames) => {
                if (err) {
                    helper.response.onError(err, callback);
                    return;
                }
                
                let frameVideos = [];
                let overlays = [];
                let workfiles = [];
                let pvFilePath = '';

                let seriesTasks = [];
                
                seriesTasks.push((series_callback) => {
                    let parallelTasks = [];

                    _.each(frames, (frame) => {
                        parallelTasks.push((parallel_callback) => {
                            overlayModel.getOverlaysByFrmId(frame.frm_id, (err, _overlays) => {
                                if (!err) {
                                    _.each(_overlays, (overlay) => {
                                        overlays.push({
                                            ovl_id: overlay.ovl_id,
                                            ovl_order: overlay.ovl_order,
                                            ovl_type: overlay.ovl_type,
                                            frm_id: overlay.frm_id,
                                            width: this.parseInt(overlay.ovl_reposition.width),
                                            height: this.parseInt(overlay.ovl_reposition.height),
                                            offsetX: this.parseInt(overlay.ovl_reposition.offsetX),
                                            offsetY: this.parseInt(overlay.ovl_reposition.offsetY),
                                            angle: overlay.ovl_reposition.angle,
                                            ovl_content: overlay.ovl_content,
                                        });
                                    });
                                }
                                parallel_callback(err);
                            });
                        });
                    });

                    async.parallel(parallelTasks, series_callback);
                });

                seriesTasks.push((series_callback) => {
                    let parallelTasks = [];

                    _.each(overlays, (overlay) => {
                        parallelTasks.push((parallel_callback) => {
                            if (overlay.ovl_type == 2) {
                                let ovl_content = overlay.ovl_content ? overlay.ovl_content : '';
                                ovl_content = ovl_content.replace(/^data:image\/png;base64,/, '');
                                let ovl_name = uuidGen.v1() + '.png';
                                helper.file.writeFile(config.server.downloadPath + ovl_name, ovl_content, 'base64', (err) => {
                                    if (!err) {
                                        gm(config.server.downloadPath + ovl_name)
                                            .resize(overlay.width, overlay.height, "!")
                                            .noProfile()
                                            .write(config.server.downloadPath + ovl_name, (err) => {
                                                if (!err) {
                                                    workfiles.push(config.server.downloadPath + ovl_name);
                                                    overlays[_.findIndex(overlays, {ovl_id: overlay.ovl_id})].ovl_path = config.server.downloadPath + ovl_name;
                                                }
                                                parallel_callback(err);
                                            });
                                    } else {
                                        parallel_callback(err);
                                    }
                                });
                            } else {
                                let filepath = overlay.ovl_content.replace('https://' + config.cloud.azure.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/stage/', config.server.uploadPath);
                                let extname = path.extname(filepath);
                                let ovl_name = uuidGen.v1() + extname;

                                if (extname == '.gif' || extname == '.GIF') {
                                    let commandLine = 'gifsicle.exe --resize ' + overlay.width + 'x' + overlay.height + ' ' + filepath + ' -o ' + config.server.downloadPath + ovl_name;
    
                                    helper.shell.shell(commandLine, (err) => {
                                        if (!err) {
                                            workfiles.push(config.server.downloadPath + ovl_name);
                                            overlays[_.findIndex(overlays, { ovl_id: overlay.ovl_id })].ovl_path = config.server.downloadPath + ovl_name;
                                        }
                                        parallel_callback(err);
                                    });
                                } else {
                                    gm(filepath)
                                        .resize(overlay.width, overlay.height)
                                        .write(config.server.downloadPath + ovl_name, (err) => {
                                            if (!err) {
                                                workfiles.push(config.server.downloadPath + ovl_name);
                                                overlays[_.findIndex(overlays, { ovl_id: overlay.ovl_id })].ovl_path = config.server.downloadPath + ovl_name;
                                            }
                                            parallel_callback(err);
                                        });
                                }
                            }
                        });
                    });
                    
                    async.parallel(parallelTasks, series_callback);
                });

                // reposition frames
                seriesTasks.push((series_callback) => {
                    setProgress(20, 'Repositioning Frames');
                    let parallelTasks = [];
                    _.each(frames, (frame) => {
                        parallelTasks.push((parallel_callback) => {
                            let mimeType = mime.lookup(frame.frm_path);
                            if (mimeType.includes('image/')) {
                                let filepath = frame.frm_path.replace('https://' + config.cloud.azure.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/stage/', config.server.uploadPath);
                                helper.video.image2reposition(filepath,
                                    frame.frm_duration,
                                    this.parseInt(frame.frm_reposition.width),
                                    this.parseInt(frame.frm_reposition.height),
                                    this.parseInt(frame.frm_reposition.offsetX),
                                    this.parseInt(frame.frm_reposition.offsetY),
                                    config.video.scene[prj_scene_ratio].width,
                                    config.video.scene[prj_scene_ratio].height,
                                    (err, newPath) => {
                                        if (!err) {
                                            workfiles.push(newPath);
                                            frameVideos.push({
                                                frm_name: frame.frm_name,
                                                frm_id: frame.frm_id,
                                                frm_order: frame.frm_order,
                                                frm_path: newPath
                                            });
                                            parallel_callback(err);
                                        } else {
                                            parallel_callback(err);
                                        }
                                    });
                            } else {
                                let filepath = frame.frm_path.replace('https://' + config.cloud.azure.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/stage/', config.server.uploadPath);
                                helper.video.video2reposition(filepath,
                                    frame.frm_duration.seekTime,
                                    frame.frm_duration.duration,
                                    frame.frm_duration.endTime,
                                    this.parseInt(frame.frm_reposition.width),
                                    this.parseInt(frame.frm_reposition.height),
                                    this.parseInt(frame.frm_reposition.offsetX),
                                    this.parseInt(frame.frm_reposition.offsetY),
                                    config.video.scene[prj_scene_ratio].width,
                                    config.video.scene[prj_scene_ratio].height,
                                    (err, newPath) => {
                                        if (!err) {
                                            workfiles.push(newPath);
                                            frameVideos.push({
                                                frm_name: frame.frm_name,
                                                frm_id: frame.frm_id,
                                                frm_order: frame.frm_order,
                                                frm_path: newPath
                                            });
                                            parallel_callback(err);
                                        } else {
                                            parallel_callback(err);
                                        }
                                });
                            }
                        });
                    });

                    async.parallel(parallelTasks, series_callback);
                });

                seriesTasks.push((series_callback) => {
                    setProgress(40, 'Processing Overlays');
                    _.sortBy(overlays, 'ovl_order');
                    overlays = _.groupBy(overlays, 'frm_id');

                    let parallelTasks = [];

                    _.each(frameVideos, (frame) => {
                        parallelTasks.push((parallel_callback) => {
                            let _seriesTasks = [];

                            let frm_overlays = overlays[frame.frm_id + ''];
                            _.sortBy(frm_overlays, 'ovl_order');

                            _.each(frm_overlays, (_overlay) => {
                                _seriesTasks.push((_series_callback) => {
                                    helper.video.mergeOverlay2Video(_overlay.ovl_path, _overlay.offsetX, _overlay.offsetY, _overlay.width, _overlay.height, _overlay.angle, frameVideos[_.findIndex(frameVideos, {
                                                frm_id: frame.frm_id
                                            })].frm_path, (err, newPath) => {
                                        if (!err) {
                                            workfiles.push(newPath);
                                            frameVideos[_.findIndex(frameVideos, {
                                                frm_id: frame.frm_id
                                            })].frm_path = newPath;
                                        }
                                        _series_callback(err);
                                    });
                                });
                            });

                            async.series(_seriesTasks, parallel_callback);
                        });
                    });

                    async.parallel(parallelTasks, series_callback);
                });

                let frameTs = [];
                
                seriesTasks.push((series_callback) => {
                    setProgress(70, 'Converting Frames');
                    let percent = 50;
                    let parallelTasks = [];

                    _.each(frameVideos, (frame) => {
                        parallelTasks.push((parallel_callback) => {
                            helper.video.convertTs(frame.frm_path, (err, newPath) => {
                                if (!err) {
                                    workfiles.push(newPath);
                                    frameTs.push({
                                        frm_name: frame.frm_name,
                                        frm_order: frame.frm_order,
                                        frm_path: newPath
                                    });
                                }
                                percent += Math.ceil(20 / frameVideos.length);
                                
                                parallel_callback(err, '');
                            });
                        });
                    });
                    
                    async.parallel(parallelTasks, series_callback)
                });
                
                seriesTasks.push((series_callback) => {
                    setProgress(90, 'Merging all Frames');
                    frameTs = _.sortBy(frameTs, 'frm_order');
                    let tsFiles = _.pluck(frameTs, 'frm_path');
                    helper.video.concatenate(tsFiles, (err, filepath) => {
                        if (err) {
                            series_callback(err);
                            return;
                        }

                        pvFilePath = filepath;
                        series_callback('');
                    });
                });

                seriesTasks.push((series_callback) => {
                    const cloudName = uuidGen.v1() + '.mp4';
                    helper.file.putFileToCloud(cloudName, prj_name, pvFilePath, (err, filepath) => {
                        workfiles.push(pvFilePath);
                        pvFilePath = filepath;
                        projectModel.updateProject(prj_id, [{name: 'prj_video_path', value: filepath}], series_callback);
                    });
                });

                seriesTasks.push((series_callback) => {
                    helper.file.deleteFiles(workfiles, series_callback);
                });

                async.series(seriesTasks, (err, res) => {
                    if (!err) {
                        helper.response.onSuccessPlus(callback, {
                            'finalvideo': pvFilePath
                        });
                    } else {
                        helper.response.onError(err, callback);
                    }
                });
            });
        } catch (err) {
            helper.response.onError('error: concatenate', callback);
        }
    }
}